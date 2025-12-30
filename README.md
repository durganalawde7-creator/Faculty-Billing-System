Faculty Daily Workload & Billing System
A web-based application designed to manage faculty daily workload entries and automated billing based on lectures, labs, and hourly pay. The system ensures accurate calculation of payments, prevents duplicate time entries, and provides a clean interface for faculty and administrators.
________________________________________
📌 Features
•	Secure faculty login & authentication
•	Daily workload entry (lectures, labs, tutorials)
•	Hourly-based pay calculation
•	Prevents duplicate or overlapping time entries for the same day
•	Automatic billing computation
•	Admin dashboard for monitoring workloads & payments
•	Persistent storage using SQLite database
________________________________________
🛠️ Tech Stack
Frontend
•	HTML5
•	CSS3
•	JavaScript
•	Bootstrap
Backend
•	Python (Flask Framework)
Database
•	SQLite3
________________________________________
🗂️ Project Structure
smart-billing-system/
│
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── database.db            # SQLite database
│
├── static/
│   ├── css/               # Stylesheets
│   ├── js/                # JavaScript files
│   └── images/            # Images (logos, icons)
│
├── templates/
│   ├── index.html         # Login page
│
└── README.md              # Project documentation
________________________________________
⚙️ Installation & Setup
1️⃣ Clone the Repository
git clone https://github.com/your-username/faculty-billing-system.git
cd faculty-billing-system
2️⃣ Create Virtual Environment (Optional but Recommended)
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
3️⃣ Install Dependencies
pip install -r requirements.txt
4️⃣ Run the Application
python app.py
The app will run on:
http://127.0.0.1:5000/
________________________________________
🧮 Billing Logic (Overview)
•	Faculty enters start time and end time for each session
•	System calculates total duration
•	Hourly rate is applied automatically
•	Multiple entries per day are allowed except overlapping timings
________________________________________
🧪 Sample Use Case
1.	Faculty logs in
2.	Enters lecture timings for the day
3.	System validates time slots
4.	Pay is calculated instantly
5.	Admin can view total workload & billing
________________________________________
🔒 Security Considerations
•	Session-based authentication
•	Input validation to avoid invalid timings
•	Restricted admin access
________________________________________
🚀 Future Enhancements
•	yearly billing reports
•	Cloud database integration
•	Attendance integration
________________________________________
👩‍💻 Author
Durga Nalawade

________________________________________
📄 License
This project is created for academic and educational purposes as well as college faculties use.

