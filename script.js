// Global variables
let currentUser = null;
let currentFacultyId = null;
let workloadChart = null;
let salaryChart = null;

const SALARY_RATES = {
    lecture: 500,
    tutorial: 300,
    lab: 400
};

window.addEventListener('load', function() {
    const today = new Date().toISOString().split('T')[0];
    const entryDate = document.getElementById('entry-date');
    if (entryDate) entryDate.value = today;
    const historyMonth = document.getElementById('history-month');
    if (historyMonth) historyMonth.value = new Date().toISOString().slice(0, 7);
    const receiptMonth = document.getElementById('receipt-month');
    if (receiptMonth) receiptMonth.value = new Date().toISOString().slice(0, 7);
});

// ============= AUTH =============
function toggleAuthForms() {
    document.getElementById('login-form').classList.toggle('active');
    document.getElementById('register-form').classList.toggle('active');
    clearAlerts();
}
function clearAlerts() {
    document.querySelectorAll('.alert-msg').forEach(el => el.classList.remove('show'));
}
function toggleShowPassword(inputId, checkboxId) {
    const input = document.getElementById(inputId);
    const cb = document.getElementById(checkboxId);
    if (input && cb) input.type = cb.checked ? 'text' : 'password';
}
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 5000);
    }
}
function showSuccess(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('show');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value.trim();
    if (!username || !password) {
        showError('login-error', 'Username and password required');
        return;
    }
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            document.getElementById('login-user').value = '';
            document.getElementById('login-pass').value = '';
            clearAlerts();
            if (currentUser.role === 'admin') {
                showPage('admin-page');
                document.getElementById('admin-username').textContent = currentUser.username;
                loadAdminDashboard();
                loadFacultyList();
            } else {
                showPage('faculty-page');
                document.getElementById('fac-username').textContent = currentUser.username;
                await loadFacultyDashboard();
            }
        } else {
            showError('login-error', data.message || 'Login failed');
        }
    } catch (error) {
        showError('login-error', 'Error: ' + error.message);
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('reg-user').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-pass').value.trim();
    const role = document.getElementById('reg-role').value;
    if (!username || !email || !password || !role) {
        showError('register-error', 'All fields required');
        return;
    }
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, role })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess('register-success', data.message);
            document.getElementById('register-form').reset();
            setTimeout(() => toggleAuthForms(), 1500);
        } else {
            showError('register-error', data.message || 'Registration failed');
        }
    } catch (error) {
        showError('register-error', 'Error: ' + error.message);
    }
}

function logout() {
    currentUser = null;
    currentFacultyId = null;
    showPage('auth-page');
    clearAlerts();
}

// ============= NAV =============
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
}
function showFacultyTab(tabName) {
    document.querySelectorAll('#faculty-page .tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#faculty-page .sidebar-nav a').forEach(a => a.classList.remove('active'));
    event && event.target && event.target.closest('a') && event.target.closest('a').classList.add('active');
    const tab = document.getElementById('fac-' + tabName);
    if (tab) tab.classList.add('active');
    if (tabName === 'entry') loadFacultySubjects();
    else if (tabName === 'history') refreshHistory();
}
function showAdminTab(tabName) {
    document.querySelectorAll('#admin-page .tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#admin-page .sidebar-nav a').forEach(a => a.classList.remove('active'));
    event && event.target && event.target.closest('a') && event.target.closest('a').classList.add('active');
    const tab = document.getElementById('admin-' + tabName);
    if (tab) tab.classList.add('active');
    if (tabName === 'faculty') loadFacultyList();
    else if (tabName === 'subjects') loadSubjectsList();
    else if (tabName === 'workload') loadWorkloadSummary();
    else if (tabName === 'analytics') loadAnalytics();
}

// ============= FACULTY =============

// Load faculty dashboard by querying the backend for the faculty with the logged-in user's email
async function loadFacultyDashboard() {
    if (!currentUser || !currentUser.email) {
        console.warn('No currentUser or email available');
        return;
    }

    try {
        const response = await fetch(`/api/admin/faculty?email=${encodeURIComponent(currentUser.email)}`);
        const result = await response.json();

        if (result.success) {
            const faculty = result.data;
            if (faculty) {
                currentFacultyId = faculty.id;
                document.getElementById('fac-name-display').textContent = faculty.name;
                await updateFacultyOverview();
                return;
            }
        }
        currentFacultyId = null;
        alert('Faculty profile not found. Contact admin.');
    } catch (error) {
        console.error('Error loading faculty dashboard:', error);
        alert('Error loading faculty profile. Check console.');
    }
}

async function updateFacultyOverview() {
    if (!currentFacultyId) return;
    try {
        const month = new Date().toISOString().slice(0, 7);
        const response = await fetch(`/api/faculty/${currentFacultyId}/monthly-summary?month=${month}`);
        const result = await response.json();
        if (result.success && result.data) {
            const data = result.data;
            const uniqueDates = new Set(data.entries.map(e => e.work_date)).size;
            const totalHours = data.entries.reduce((sum, e) => sum + e.duration_hours, 0);
            document.getElementById('fac-total-days').textContent = uniqueDates;
            document.getElementById('fac-total-hours').textContent = totalHours.toFixed(2);
            document.getElementById('fac-total-pay').textContent = '₹' + data.total_pay.toLocaleString('en-IN');
        }
    } catch (error) {
        console.error('Error updating overview:', error);
    }
}

async function loadFacultySubjects() {
    if (!currentFacultyId) return;
    try {
        const response = await fetch(`/api/faculty/${currentFacultyId}/subjects`);
        const result = await response.json();
        if (result.success && result.data) {
            const select = document.getElementById('entry-subject');
            select.innerHTML = '<option value="">Select Subject</option>';
            result.data.forEach(s => {
                select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

function calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh*60 + sm, endMin = eh*60 + em;
    return ((endMin - startMin)/60).toFixed(2);
}

function updatePreview() {
    const activityType = document.getElementById('entry-activity').value;
    const startTime = document.getElementById('entry-start').value;
    const endTime = document.getElementById('entry-end').value;
    if (!activityType || !startTime || !endTime) {
        document.getElementById('preview-box').style.display = 'none';
        return;
    }
    const hours = parseFloat(calculateDuration(startTime, endTime));
    if (hours <= 0) { document.getElementById('preview-box').style.display = 'none'; return; }
    const rate = SALARY_RATES[activityType] || 0;
    const pay = Math.round(hours * rate);
    document.getElementById('preview-hours').textContent = hours;
    document.getElementById('preview-amount').textContent = pay.toLocaleString('en-IN');
    document.getElementById('preview-box').style.display = 'block';
}

async function handleAddEntry(event) {
    event.preventDefault();
    if (!currentFacultyId) return alert('Faculty not loaded');
    const date = document.getElementById('entry-date').value;
    const subject_id = document.getElementById('entry-subject').value;
    const activity_type = document.getElementById('entry-activity').value;
    const start_time = document.getElementById('entry-start').value;
    const end_time = document.getElementById('entry-end').value;
    if (!subject_id || !activity_type) return alert('Please fill all fields');
    const hours = parseFloat(calculateDuration(start_time, end_time));
    if (hours <= 0) return alert('End time must be after start time');
    try {
        const response = await fetch(`/api/faculty/${currentFacultyId}/daily-workload`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, subject_id, activity_type, start_time, end_time })
        });
        const result = await response.json();
        if (result.success) {
            alert('Entry saved successfully!');
            document.getElementById('entry-form').reset();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('entry-date').value = today;
            document.getElementById('preview-box').style.display = 'none';
            await updateFacultyOverview();
            await refreshHistory();
            if (document.getElementById('admin-page').classList.contains('active')) {
                loadAdminDashboard();
                loadWorkloadSummary();
            }
        } else {
            alert('Error: ' + (result.message || 'Failed to save'));
        }
    } catch (error) { alert('Error: ' + error.message); }
}

async function refreshHistory() {
    if (!currentFacultyId) return;
    const month = document.getElementById('history-month').value;
    try {
        const response = await fetch(`/api/faculty/${currentFacultyId}/monthly-summary?month=${month}`);
        const result = await response.json();
        if (result.success && result.data) {
            const data = result.data;
            const container = document.getElementById('history-container');
            if (data.entries.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No entries for this month</p>';
                return;
            }
            container.innerHTML = '';
            data.entries.forEach(entry => {
                const activityLabel = entry.activity_type.charAt(0).toUpperCase() + entry.activity_type.slice(1);
                container.innerHTML += `
                    <div class="form-card" id="entry-card-${entry.id}">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h6 style="color: var(--primary); margin: 0;">${entry.work_date_formatted} - <span class="entry-subject">${entry.subject_name}</span></h6>
                            <div>
                                <button class="btn btn-sm btn-outline-primary" onclick="startEdit(${entry.id})"><i class="fas fa-edit"></i> Edit</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteEntry(${entry.id})">Delete</button>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; align-items:center;">
                            <div>
                                <small style="color: #666;">Activity Type</small>
                                <div class="entry-activity" data-value="${entry.activity_type}" id="activity-display-${entry.id}">${activityLabel}</div>
                            </div>
                            <div>
                                <small style="color: #666;">Time</small>
                                <div class="entry-time" id="time-display-${entry.id}">${entry.start_time} - ${entry.end_time}</div>
                            </div>
                            <div>
                                <small style="color: #666;">Duration</small>
                                <div class="entry-duration" id="duration-display-${entry.id}">${entry.duration_hours.toFixed(2)} hrs</div>
                            </div>
                            <div>
                                <small style="color: #666;">Daily Pay</small>
                                <div style="font-size: 18px; color: var(--success); font-weight: bold;">₹${entry.daily_pay.toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <!-- hidden edit form -->
                        <div id="edit-form-${entry.id}" style="display:none; margin-top:15px;">
                            <div style="display:grid; grid-template-columns: repeat(4,1fr); gap:12px;">
                                <div>
                                    <label>Date</label>
                                    <input type="date" id="edit-date-${entry.id}" class="form-control" value="${entry.work_date}">
                                </div>
                                <div>
                                    <label>Subject</label>
                                    <select id="edit-subject-${entry.id}" class="form-control"></select>
                                </div>
                                <div>
                                    <label>Activity</label>
                                    <select id="edit-activity-${entry.id}" class="form-control">
                                        <option value="lecture">Lecture (₹500/hr)</option>
                                        <option value="tutorial">Tutorial (₹300/hr)</option>
                                        <option value="lab">Lab Session (₹400/hr)</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Start</label>
                                    <input type="time" id="edit-start-${entry.id}" class="form-control">
                                </div>
                                <div>
                                    <label>End</label>
                                    <input type="time" id="edit-end-${entry.id}" class="form-control">
                                </div>
                            </div>
                            <div style="margin-top:10px; display:flex; gap:10px;">
                                <button class="btn btn-success" onclick="saveEdit(${entry.id})">Save</button>
                                <button class="btn btn-secondary" onclick="cancelEdit(${entry.id})">Cancel</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            for (const e of data.entries) {
                await populateEditSubjects(e.id, e.subject_id);
                const activityEl = document.getElementById(`edit-activity-${e.id}`);
                if (activityEl) activityEl.value = e.activity_type;
                const startEl = document.getElementById(`edit-start-${e.id}`);
                const endEl = document.getElementById(`edit-end-${e.id}`);
                if (startEl) startEl.value = e.start_time;
                if (endEl) endEl.value = e.end_time;
            }

            const totalHours = data.entries.reduce((sum, e) => sum + e.duration_hours, 0);
            container.innerHTML += `
                <div class="form-card" style="background: linear-gradient(135deg, rgba(0, 102, 204, 0.05) 0%, rgba(0, 102, 204, 0.02) 100%); border-left-color: var(--secondary);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h6 style="color: var(--secondary); margin: 0;">Total Hours: ${totalHours.toFixed(2)}</h6>
                        <h6 style="color: var(--secondary); margin: 0;">Monthly Total: ₹${data.total_pay.toLocaleString('en-IN')}</h6>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

async function populateEditSubjects(entryId, selectedSubjectId) {
    try {
        const response = await fetch(`/api/faculty/${currentFacultyId}/subjects`);
        const result = await response.json();
        if (result.success) {
            const select = document.getElementById(`edit-subject-${entryId}`);
            if (!select) return;
            select.innerHTML = '<option value="">Select Subject</option>';
            result.data.forEach(s => {
                const sel = s.id === selectedSubjectId ? 'selected' : '';
                select.innerHTML += `<option value="${s.id}" ${sel}>${s.name}</option>`;
            });
        }
    } catch (err) {
        console.error('Error populating edit subjects', err);
    }
}

function startEdit(entryId) {
    document.getElementById(`edit-form-${entryId}`).style.display = 'block';
    document.getElementById(`activity-display-${entryId}`).style.display = 'none';
    document.getElementById(`time-display-${entryId}`).style.display = 'none';
    document.getElementById(`duration-display-${entryId}`).style.display = 'none';
}

function cancelEdit(entryId) {
    document.getElementById(`edit-form-${entryId}`).style.display = 'none';
    document.getElementById(`activity-display-${entryId}`).style.display = 'block';
    document.getElementById(`time-display-${entryId}`).style.display = 'block';
    document.getElementById(`duration-display-${entryId}`).style.display = 'block';
}

async function saveEdit(entryId) {
    const date = document.getElementById(`edit-date-${entryId}`).value;
    const subject_id = document.getElementById(`edit-subject-${entryId}`).value;
    const activity_type = document.getElementById(`edit-activity-${entryId}`).value;
    const start_time = document.getElementById(`edit-start-${entryId}`).value;
    const end_time = document.getElementById(`edit-end-${entryId}`).value;
    if (!date || !subject_id || !activity_type || !start_time || !end_time) return alert('Fill all fields');
    const hours = parseFloat(calculateDuration(start_time, end_time));
    if (hours <= 0) return alert('End time must be after start time');

    try {
        const response = await fetch(`/api/faculty/${currentFacultyId}/daily-workload/${entryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, subject_id, activity_type, start_time, end_time })
        });
        const result = await response.json();
        if (result.success) {
            alert('Entry updated');
            cancelEdit(entryId);
            await refreshHistory();
            await updateFacultyOverview();
            if (document.getElementById('admin-page').classList.contains('active')) {
                loadAdminDashboard();
                loadWorkloadSummary();
            }
        } else {
            alert('Error: ' + (result.message || 'Failed to update'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteEntry(entryId) {
    if (!confirm('Delete this entry?')) return;
    try {
        const response = await fetch(`/api/faculty/${currentFacultyId}/daily-workload/${entryId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            alert('Entry deleted!');
            await refreshHistory();
            await updateFacultyOverview();
            if (document.getElementById('admin-page').classList.contains('active')) {
                loadAdminDashboard();
                loadWorkloadSummary();
            }
        } else {
            alert('Error: ' + (result.message || 'Failed to delete'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ============= RECEIPT PREVIEW =============
async function previewReceipt() {
    if (!currentFacultyId) return alert('Faculty not loaded');
    const month = document.getElementById('receipt-month').value;
    if (!month) return alert('Please select month');
    try {
        const response = await fetch(`/api/faculty/${currentFacultyId}/monthly-summary?month=${month}`);
        const result = await response.json();
        const previewDiv = document.getElementById('receipt-preview');
        if (!result.success) {
            previewDiv.style.display = 'block';
            previewDiv.innerHTML = `<p style="color:#888;">No entries for ${month}</p>`;
            return;
        }
        const data = result.data;
        let html = `<h5 style="margin-bottom:8px;">Receipt Preview — ${month}</h5>`;
        html += `<div style="margin-bottom:10px;"><strong>Faculty:</strong> ${document.getElementById('fac-name-display').textContent}</div>`;
        html += `<table class="table table-sm"><thead><tr><th>Date</th><th>Subject</th><th>Activity</th><th>Time</th><th>Hours</th><th>Pay</th></tr></thead><tbody>`;
        data.entries.forEach(e => {
            html += `<tr><td>${e.work_date_formatted}</td><td>${e.subject_name}</td><td>${e.activity_type}</td><td>${e.start_time}-${e.end_time}</td><td>${e.duration_hours.toFixed(2)}</td><td>₹${e.daily_pay.toLocaleString('en-IN')}</td></tr>`;
        });
        html += `<tr style="background:#f5f5f5;font-weight:bold;"><td colspan="4">TOTAL</td><td>${data.entries.reduce((s,e)=>s+e.duration_hours,0).toFixed(2)}</td><td>₹${data.total_pay.toLocaleString('en-IN')}</td></tr>`;
        html += `</tbody></table>`;
        previewDiv.style.display = 'block';
        previewDiv.innerHTML = html;
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function downloadReceipt() {
    const month = document.getElementById('receipt-month').value;
    if (!month) return alert('Please select a month');
    window.location.href = `/api/faculty/${currentFacultyId}/receipt/pdf?month=${month}`;
}

// ============= ADMIN =============
async function loadAdminDashboard() {
    try {
        const response = await fetch('/api/admin/analytics');
        const result = await response.json();
        if (result.success && result.data) {
            const data = result.data;
            document.getElementById('admin-total-faculty').textContent = data.total_faculty;
            document.getElementById('admin-total-entries').textContent = data.total_workload_entries;
            document.getElementById('admin-total-salary').textContent = '₹' + data.total_salary.toLocaleString('en-IN');
        }
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
    }
}

function showFacultyForm() {
    document.getElementById('add-faculty-form').style.display = 'block';
}
function hideFacultyForm() {
    document.getElementById('add-faculty-form').style.display = 'none';
    document.getElementById('faculty-form').reset();
    document.getElementById('fac-add-error') && (document.getElementById('fac-add-error').classList.remove('show'));
}

async function handleAddFaculty(event) {
    event.preventDefault();
    const name = document.getElementById('fac-name').value.trim();
    const email = document.getElementById('fac-email').value.trim();
    const department = document.getElementById('fac-dept').value.trim();
    if (!name || !email || !department) {
        showError('fac-add-error', 'All fields required');
        return;
    }
    try {
        const listResp = await fetch('/api/admin/faculty');
        const list = await listResp.json();
        if (list.success) {
            const dup = list.data.find(f => f.name.toLowerCase() === name.toLowerCase() || f.email.toLowerCase() === email.toLowerCase());
            if (dup) {
                showError('fac-add-error', 'Faculty with same name or email already exists');
                return;
            }
        }
        const response = await fetch('/api/admin/faculty', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, department })
        });
        const result = await response.json();
        if (result.success) {
            alert('Faculty added!');
            hideFacultyForm();
            loadFacultyList();
            loadAdminDashboard();
        } else {
            showError('fac-add-error', result.message || 'Failed');
        }
    } catch (error) {
        showError('fac-add-error', 'Error: ' + error.message);
    }
}

async function loadFacultyList() {
    try {
        const response = await fetch('/api/admin/faculty');
        const result = await response.json();
        if (result.success && result.data) {
            const tbody = document.getElementById('faculty-tbody');
            tbody.innerHTML = '';
            result.data.forEach(f => {
                tbody.innerHTML += `
                    <tr>
                        <td>${f.id}</td>
                        <td>${f.name}</td>
                        <td>${f.email}</td>
                        <td>${f.department}</td>
                        <td><button class="btn btn-danger" onclick="deleteFaculty(${f.id})">Delete</button></td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading faculty list:', error);
    }
}

async function deleteFaculty(id) {
    if (!confirm('Delete this faculty?')) return;
    try {
        const response = await fetch(`/api/admin/faculty/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            alert('Deleted!');
            loadFacultyList();
            loadAdminDashboard();
            loadWorkloadSummary();
        } else {
            alert('Error: ' + (result.message || 'Failed'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showSubjectForm() {
    document.getElementById('add-subject-form').style.display = 'block';
    loadFacultyForSelect();
}
function hideSubjectForm() {
    document.getElementById('add-subject-form').style.display = 'none';
    document.getElementById('subject-form').reset();
}

async function loadFacultyForSelect() {
    try {
        const response = await fetch('/api/admin/faculty');
        const result = await response.json();
        if (result.success && result.data) {
            const select = document.getElementById('subj-faculty');
            select.innerHTML = '<option value="">Select Faculty</option>';
            result.data.forEach(f => {
                select.innerHTML += `<option value="${f.id}">${f.name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading faculty:', error);
    }
}

async function handleAddSubject(event) {
    event.preventDefault();
    const name = document.getElementById('subj-name').value;
    const faculty_id = document.getElementById('subj-faculty').value;
    try {
        const response = await fetch('/api/admin/subjects', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, faculty_id })
        });
        const result = await response.json();
        if (result.success) {
            alert('Subject added!');
            hideSubjectForm();
            loadSubjectsList();
        } else {
            alert('Error: ' + (result.message || 'Failed'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function loadSubjectsList() {
    try {
        const response = await fetch('/api/admin/subjects');
        const result = await response.json();
        if (result.success && result.data) {
            const tbody = document.getElementById('subjects-tbody');
            tbody.innerHTML = '';
            result.data.forEach(s => {
                tbody.innerHTML += `
                    <tr>
                        <td>${s.id}</td>
                        <td>${s.name}</td>
                        <td>${s.faculty_name || 'N/A'}</td>
                        <td><button class="btn btn-danger" onclick="deleteSubject(${s.id})">Delete</button></td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

async function deleteSubject(id) {
    if (!confirm('Delete this subject?')) return;
    try {
        const response = await fetch(`/api/admin/subjects/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) loadSubjectsList();
        else alert('Error: ' + (result.message || 'Failed'));
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function loadWorkloadSummary() {
    try {
        const response = await fetch('/api/admin/workload');
        const result = await response.json();
        if (result.success && result.data) {
            const container = document.getElementById('workload-container');
            container.innerHTML = '';
            const grouped = {};
            result.data.forEach(w => {
                if (!grouped[w.faculty_id]) grouped[w.faculty_id] = { name: w.faculty_name, entries: [] };
                grouped[w.faculty_id].entries.push(w);
            });
            Object.values(grouped).forEach(group => {
                let totalPay = 0; let totalHours = 0;
                let html = `<div class="form-card"><h6 style="color: var(--primary); margin-bottom: 15px;">${group.name}</h6><div class="table-wrapper"><table class="table table-sm"><thead><tr><th>Date</th><th>Subject</th><th>Activity</th><th>Time</th><th>Hours</th><th>Pay</th></tr></thead><tbody>`;
                group.entries.forEach(e => {
                    totalPay += e.daily_pay; totalHours += e.duration_hours;
                    const actLabel = e.activity_type.charAt(0).toUpperCase() + e.activity_type.slice(1);
                    html += `<tr><td>${e.work_date_formatted}</td><td>${e.subject_name}</td><td>${actLabel}</td><td>${e.start_time}-${e.end_time}</td><td>${e.duration_hours.toFixed(2)}</td><td>₹${e.daily_pay.toLocaleString('en-IN')}</td></tr>`;
                });
                html += `<tr style="background: #f0f0f0; font-weight: bold;"><td colspan="4">Total:</td><td>${totalHours.toFixed(2)} hrs</td><td>₹${totalPay.toLocaleString('en-IN')}</td></tr></tbody></table></div></div>`;
                container.innerHTML += html;
            });
        }
    } catch (error) {
        console.error('Error loading workload:', error);
    }
}

async function loadAnalytics() {
    try {
        const response = await fetch('/api/admin/analytics');
        const result = await response.json();
        if (result.success && result.data.faculty_workload.length > 0) {
            const data = result.data;
            if (workloadChart) workloadChart.destroy();
            const ctx1 = document.getElementById('workload-chart');
            if (ctx1) {
                workloadChart = new Chart(ctx1, {
                    type: 'bar',
                    data: {
                        labels: data.faculty_workload.map(f => f.name),
                        datasets: [{ label: 'Total Hours', data: data.faculty_workload.map(f => f.workload) }]
                    },
                    options: { responsive: true, scales: { y: { beginAtZero: true } } }
                });
            }
            if (salaryChart) salaryChart.destroy();
            const ctx2 = document.getElementById('salary-chart');
            if (ctx2) {
                salaryChart = new Chart(ctx2, {
                    type: 'doughnut',
                    data: {
                        labels: data.salary_distribution.map(s => s.name),
                        datasets: [{ data: data.salary_distribution.map(s => s.salary) }]
                    },
                    options: { responsive: true }
                });
            }
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}
