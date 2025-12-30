from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import io
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER

app = Flask(__name__)
CORS(app)

DATABASE = "billing_system.db"

SALARY_RATES = {
    "lecture": 500,
    "tutorial": 300,
    "lab": 400
}

COLLEGE_NAME = "LOKNETE SHAMRAO PEJE GOVERNMENT COLLEGE OF ENGINEERING, RATNAGIRI"


def init_db():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('PRAGMA journal_mode=WAL')
    cursor.execute('PRAGMA busy_timeout=5000')
    cursor.execute('PRAGMA foreign_keys = ON')

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS faculty(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            department TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS subjects(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            faculty_id INTEGER NOT NULL,
            FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_workload(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            faculty_id INTEGER NOT NULL,
            subject_id INTEGER NOT NULL,
            work_date TEXT NOT NULL,
            activity_type TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            duration_hours REAL NOT NULL,
            hourly_rate REAL NOT NULL,
            daily_pay REAL NOT NULL,
            FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_workload_faculty_date 
        ON daily_workload(faculty_id, work_date)
    """)

    conn.commit()
    conn.close()


def get_db():
    conn = sqlite3.connect(DATABASE, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA busy_timeout=5000')
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def format_date(date_str):
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%d-%m-%Y")
    except:
        return date_str


def calculate_duration(start, end):
    try:
        s = datetime.strptime(start, "%H:%M")
        e = datetime.strptime(end, "%H:%M")
        diff = (e - s).total_seconds() / 3600
        return round(diff, 2)
    except:
        return 0


def check_overlap(conn, faculty_id, work_date, start, end, exclude_id=None):
    cursor = conn.cursor()
    query = """SELECT id, start_time, end_time FROM daily_workload
               WHERE faculty_id = ? AND work_date = ?"""
    params = [faculty_id, work_date]

    if exclude_id:
        query += " AND id != ?"
        params.append(exclude_id)

    cursor.execute(query, params)
    rows = cursor.fetchall()

    try:
        s = datetime.strptime(start, "%H:%M")
        e = datetime.strptime(end, "%H:%M")
    except Exception:
        return True  # invalid times -> treat as overlap to prevent insertion

    for row in rows:
        es = datetime.strptime(row["start_time"], "%H:%M")
        ee = datetime.strptime(row["end_time"], "%H:%M")
        if s < ee and e > es:
            return True

    return False


@app.route("/")
def main():
    return render_template("index.html")


# AUTH
@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password required"}), 400

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()

        if not user or not check_password_hash(user["password"], password):
            return jsonify({"success": False, "message": "Invalid username or password"}), 401

        return jsonify({
            "success": True,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "role": user["role"]
            }
        })
    finally:
        conn.close()


@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()
    role = data.get("role", "faculty")

    if not username or not email or not password:
        return jsonify({"success": False, "message": "All fields required"}), 400

    conn = get_db()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            return jsonify({"success": False, "message": "Username already exists"}), 400

        cursor.execute("""
            INSERT INTO users(username, email, password, role)
            VALUES (?, ?, ?, ?)
        """, (username, email, generate_password_hash(password), role))

        conn.commit()
        return jsonify({"success": True, "message": "Registration successful!"})

    except sqlite3.IntegrityError as ie:
        return jsonify({"success": False, "message": "Username or email already exists"}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


# FACULTY endpoints
@app.route("/api/faculty/<int:faculty_id>/subjects", methods=["GET"])
def faculty_subjects(faculty_id):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM subjects WHERE faculty_id = ? ORDER BY name", (faculty_id,))
        res = [dict(r) for r in cursor.fetchall()]
        return jsonify({"success": True, "data": res})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/faculty/<int:faculty_id>/daily-workload", methods=["POST"])
def add_workload(faculty_id):
    data = request.json

    work_date = data.get("date")
    subject_id = data.get("subject_id")
    activity_type = data.get("activity_type")
    start = data.get("start_time")
    end = data.get("end_time")

    if not all([work_date, subject_id, activity_type, start, end]):
        return jsonify({"success": False, "message": "All fields required"}), 400

    duration = calculate_duration(start, end)
    if duration <= 0:
        return jsonify({"success": False, "message": "End time must be after start time"}), 400

    conn = get_db()
    try:
        if check_overlap(conn, faculty_id, work_date, start, end):
            return jsonify({"success": False, "message": "Time slot overlaps with existing entry"}), 400

        rate = SALARY_RATES.get(activity_type, 500)
        pay = round(duration * rate, 2)

        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO daily_workload(faculty_id, subject_id, work_date, activity_type,
            start_time, end_time, duration_hours, hourly_rate, daily_pay)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (faculty_id, subject_id, work_date, activity_type, start, end, duration, rate, pay))

        conn.commit()
        return jsonify({"success": True, "message": "Entry added successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/faculty/<int:faculty_id>/daily-workload/<int:entry_id>", methods=["DELETE"])
def delete_workload(faculty_id, entry_id):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM daily_workload WHERE id = ? AND faculty_id = ?", (entry_id, faculty_id))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"success": False, "message": "Entry not found"}), 404

        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


# UPDATE endpoint (PUT) — important fix for edit feature
@app.route("/api/faculty/<int:faculty_id>/daily-workload/<int:entry_id>", methods=["PUT"])
def update_workload(faculty_id, entry_id):
    data = request.json

    work_date = data.get("date")
    subject_id = data.get("subject_id")
    activity_type = data.get("activity_type")
    start = data.get("start_time")
    end = data.get("end_time")

    if not all([work_date, subject_id, activity_type, start, end]):
        return jsonify({"success": False, "message": "All fields required"}), 400

    duration = calculate_duration(start, end)
    if duration <= 0:
        return jsonify({"success": False, "message": "End time must be after start time"}), 400

    conn = get_db()
    try:
        if check_overlap(conn, faculty_id, work_date, start, end, exclude_id=entry_id):
            return jsonify({"success": False, "message": "Time slot overlaps with another entry"}), 400

        rate = SALARY_RATES.get(activity_type, 500)
        pay = round(duration * rate, 2)

        cursor = conn.cursor()
        cursor.execute("""
            UPDATE daily_workload
            SET subject_id = ?, work_date = ?, activity_type = ?,
                start_time = ?, end_time = ?, duration_hours = ?,
                hourly_rate = ?, daily_pay = ?
            WHERE id = ? AND faculty_id = ?
        """, (subject_id, work_date, activity_type, start, end,
              duration, rate, pay, entry_id, faculty_id))

        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"success": False, "message": "Entry not found"}), 404

        return jsonify({"success": True, "message": "Entry updated successfully"})

    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/faculty/<int:faculty_id>/monthly-summary", methods=["GET"])
def monthly_summary(faculty_id):
    month = request.args.get("month")

    if not month:
        return jsonify({"success": False, "message": "Month parameter required"}), 400

    conn = get_db()
    try:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT dw.*, s.name as subject_name
            FROM daily_workload dw
            JOIN subjects s ON dw.subject_id = s.id
            WHERE dw.faculty_id = ? AND strftime('%Y-%m', dw.work_date) = ?
            ORDER BY dw.work_date DESC, dw.start_time ASC
        """, (faculty_id, month))

        entries = []
        total_pay = 0

        for row in cursor.fetchall():
            entry = dict(row)
            entry["work_date_formatted"] = format_date(entry["work_date"])
            entries.append(entry)
            total_pay += entry["daily_pay"]

        return jsonify({
            "success": True,
            "data": {
                "entries": entries,
                "total_pay": round(total_pay, 2)
            }
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/faculty/<int:faculty_id>/receipt/pdf", methods=["GET"])
def generate_receipt(faculty_id):
    month = request.args.get("month")

    if not month:
        return jsonify({"success": False, "message": "Month parameter required"}), 400

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM faculty WHERE id = ?", (faculty_id,))
        faculty_row = cursor.fetchone()

        if not faculty_row:
            return jsonify({"success": False, "message": "Faculty not found"}), 404

        faculty = dict(faculty_row)

        cursor.execute("""
            SELECT dw.*, s.name as subject_name
            FROM daily_workload dw
            JOIN subjects s ON dw.subject_id = s.id
            WHERE dw.faculty_id = ? AND strftime('%Y-%m', dw.work_date) = ?
            ORDER BY dw.work_date, dw.start_time
        """, (faculty_id, month))

        entries = [dict(row) for row in cursor.fetchall()]

        if not entries:
            return jsonify({"success": False, "message": "No entries found for this month"}), 404

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch)
        elements = []

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=14,
            textColor=colors.HexColor('#003366'),
            spaceAfter=6,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )

        elements.append(Paragraph(COLLEGE_NAME, title_style))
        elements.append(Spacer(1, 0.1*inch))
        elements.append(Paragraph(f"<b>Monthly Payment Receipt - {month}</b>", styles['Heading2']))
        elements.append(Spacer(1, 0.2*inch))

        info_data = [
            ["Faculty Name:", faculty["name"]],
            ["Department:", faculty["department"]],
            ["Email:", faculty["email"]],
            ["Month:", month]
        ]

        info_table = Table(info_data, colWidths=[1.5*inch, 4*inch])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#003366')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))

        elements.append(info_table)
        elements.append(Spacer(1, 0.3*inch))

        table_data = [["Date", "Subject", "Activity", "Time", "Hours", "Rate/Hr", "Pay"]]

        total_hours = 0
        total_pay = 0

        for entry in entries:
            table_data.append([
                format_date(entry["work_date"]),
                entry["subject_name"][:20],
                entry["activity_type"].capitalize(),
                f"{entry['start_time']}-{entry['end_time']}",
                f"{entry['duration_hours']:.2f}",
                f"₹{int(entry['hourly_rate'])}",
                f"₹{entry['daily_pay']:.2f}"
            ])
            total_hours += entry["duration_hours"]
            total_pay += entry["daily_pay"]

        table_data.append(["", "", "", "TOTAL:", f"{total_hours:.2f}", "", f"₹{total_pay:.2f}"])

        table = Table(table_data, colWidths=[0.9*inch, 1.5*inch, 0.9*inch, 1.2*inch, 0.7*inch, 0.7*inch, 0.9*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0f0f0')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -2), 9),
            ('FONTSIZE', (0, -1), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))

        elements.append(table)
        elements.append(Spacer(1, 0.3*inch))

        note = Paragraph("<i>This is a computer-generated receipt.</i>", styles['Normal'])
        elements.append(note)

        doc.build(elements)
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'receipt_{faculty["name"].replace(" ", "_")}_{month}.pdf'
        )

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


# ADMIN endpoints
@app.route("/api/admin/faculty", methods=["GET", "POST"])
def manage_faculty():
    conn = get_db()

    if request.method == "GET":
        try:
            q_email = request.args.get("email")
            cursor = conn.cursor()

            if q_email:
                cursor.execute("SELECT * FROM faculty WHERE lower(email) = lower(?) LIMIT 1", (q_email,))
                row = cursor.fetchone()
                if row:
                    return jsonify({"success": True, "data": dict(row)})
                else:
                    return jsonify({"success": True, "data": None})

            cursor.execute("SELECT * FROM faculty ORDER BY id ASC")
            result = [dict(r) for r in cursor.fetchall()]
            return jsonify({"success": True, "data": result})
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500
        finally:
            conn.close()

    else:
        data = request.json

        if not all(k in data for k in ["name", "email", "department"]):
            return jsonify({"success": False, "message": "All fields required"}), 400

        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO faculty(name, email, department)
                VALUES (?, ?, ?)
            """, (data["name"], data["email"], data["department"]))
            conn.commit()

            new_id = cursor.lastrowid
            cursor.execute("SELECT * FROM faculty WHERE id = ?", (new_id,))
            new_row = cursor.fetchone()
            return jsonify({"success": True, "message": "Faculty added successfully", "data": dict(new_row)})

        except sqlite3.IntegrityError:
            return jsonify({"success": False, "message": "Email already exists"}), 400
        except Exception as e:
            conn.rollback()
            return jsonify({"success": False, "message": str(e)}), 500
        finally:
            conn.close()


@app.route("/api/admin/faculty/<int:faculty_id>", methods=["DELETE"])
def delete_faculty(faculty_id):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT email FROM faculty WHERE id = ?", (faculty_id,))
        row = cursor.fetchone()

        if row:
            cursor.execute("DELETE FROM users WHERE email = ?", (row["email"],))

        cursor.execute("DELETE FROM faculty WHERE id = ?", (faculty_id,))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"success": False, "message": "Faculty not found"}), 404

        return jsonify({"success": True})

    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/admin/subjects", methods=["GET", "POST"])
def manage_subjects():
    conn = get_db()

    if request.method == "GET":
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.*, f.name as faculty_name
                FROM subjects s
                LEFT JOIN faculty f ON s.faculty_id = f.id
                ORDER BY s.name
            """)
            result = [dict(r) for r in cursor.fetchall()]
            return jsonify({"success": True, "data": result})
        except Exception as e:
            return jsonify({"success": False, "message": str(e)}), 500
        finally:
            conn.close()

    else:
        data = request.json

        if not all(k in data for k in ["name", "faculty_id"]):
            return jsonify({"success": False, "message": "All fields required"}), 400

        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO subjects(name, faculty_id)
                VALUES (?, ?)
            """, (data["name"], data["faculty_id"]))
            conn.commit()
            return jsonify({"success": True, "message": "Subject added successfully"})
        except Exception as e:
            conn.rollback()
            return jsonify({"success": False, "message": str(e)}), 500
        finally:
            conn.close()


@app.route("/api/admin/subjects/<int:subject_id>", methods=["DELETE"])
def delete_subject(subject_id):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"success": False, "message": "Subject not found"}), 404

        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/admin/workload", methods=["GET"])
def admin_workload():
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT dw.*, f.name as faculty_name, s.name as subject_name
            FROM daily_workload dw
            JOIN faculty f ON dw.faculty_id = f.id
            JOIN subjects s ON dw.subject_id = s.id
            ORDER BY dw.work_date DESC, f.name, dw.start_time
        """)

        entries = []
        for row in cursor.fetchall():
            entry = dict(row)
            entry["work_date_formatted"] = format_date(entry["work_date"])
            entries.append(entry)

        return jsonify({"success": True, "data": entries})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/admin/analytics", methods=["GET"])
def analytics():
    conn = get_db()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as count FROM faculty")
        total_faculty = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM daily_workload")
        total_entries = cursor.fetchone()["count"]

        cursor.execute("SELECT COALESCE(SUM(daily_pay), 0) as total FROM daily_workload")
        total_salary = cursor.fetchone()["total"]

        cursor.execute("""
            SELECT f.name, COALESCE(SUM(dw.duration_hours), 0) as workload
            FROM faculty f
            LEFT JOIN daily_workload dw ON f.id = dw.faculty_id
            GROUP BY f.id, f.name
            ORDER BY workload DESC
        """)
        faculty_workload = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT f.name, COALESCE(SUM(dw.daily_pay), 0) as salary
            FROM faculty f
            LEFT JOIN daily_workload dw ON f.id = dw.faculty_id
            GROUP BY f.id, f.name
            HAVING salary > 0
            ORDER BY salary DESC
        """)
        salary_distribution = [dict(r) for r in cursor.fetchall()]

        return jsonify({
            "success": True,
            "data": {
                "total_faculty": total_faculty,
                "total_workload_entries": total_entries,
                "total_salary": round(total_salary, 2),
                "faculty_workload": faculty_workload,
                "salary_distribution": salary_distribution
            }
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


if __name__ == "__main__":
    with app.app_context():
        init_db()
        print("Database initialized with WAL mode")
        print(f"Server starting on http://0.0.0.0:5000")

    app.run(host="0.0.0.0", port=5000, debug=True)
