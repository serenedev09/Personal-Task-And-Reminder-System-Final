"""
MyEstia - Personal Task and Reminder System
Main Flask Application and API Router
"""

import os
import json
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
from werkzeug.security import generate_password_hash, check_password_hash

import database

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
app.secret_key = os.environ.get('SECRET_KEY', 'myestia-super-secure-key-2026-prod')

try:
    app.json.sort_keys = False
except AttributeError:
    app.config['JSON_SORT_KEYS'] = False

# Ensure database is initialized on startup
database.init_db()

# ==========================================
# Authentication Helpers & Decorators
# ==========================================

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

def get_current_user_id():
    return session.get('user_id')

def row_to_dict(row):
    return dict(row) if row else None

def rows_to_list(rows):
    return [dict(r) for r in rows] if rows else []

# ==========================================
# Page Views
# ==========================================

@app.route('/')
def index_page():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login_page():
    if 'user_id' in session:
        return redirect(url_for('index_page'))
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register_page():
    if 'user_id' in session:
        return redirect(url_for('index_page'))
    return render_template('register.html')

# ==========================================
# Auth REST APIs
# ==========================================

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    full_name = data.get('full_name', '').strip()
    username = data.get('username', '').strip().lower()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not full_name or not username or not email or not password:
        return jsonify({'success': False, 'message': 'All fields are required.'}), 400

    if len(username) < 3:
        return jsonify({'success': False, 'message': 'Username must be at least 3 characters long.'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters long.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()

    try:
        # Check if username or email is already taken
        cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email))
        if cursor.fetchone():
            return jsonify({'success': False, 'message': 'Username or Email is already registered.'}), 409

        password_hash = generate_password_hash(password)
        cursor.execute("""
            INSERT INTO users (username, email, password_hash, full_name, theme_preference, avatar_color)
            VALUES (?, ?, ?, ?, 'dark', '#6366f1')
        """, (username, email, password_hash, full_name))
        user_id = cursor.lastrowid

        # Setup default categories
        database.create_default_categories_for_user(user_id, conn)

        # Welcome notification
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, ?, ?, 'system')
        """, (user_id, "Welcome to MyEstia!", f"Hi {full_name}, your workspace is ready. Add your first task or category!"))

        conn.commit()

        # Log user in
        session['user_id'] = user_id
        session['username'] = username
        session['full_name'] = full_name

        return jsonify({
            'success': True,
            'message': 'Account created successfully!',
            'user': {
                'id': user_id,
                'username': username,
                'email': email,
                'full_name': full_name,
                'theme_preference': 'dark'
            }
        })
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': f'Server error: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username_or_email = data.get('username_or_email', '').strip().lower()
    password = data.get('password', '')

    if not username_or_email or not password:
        return jsonify({'success': False, 'message': 'Username/Email and Password are required.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, username, email, password_hash, full_name, theme_preference, avatar_color
            FROM users
            WHERE username = ? OR email = ?
        """, (username_or_email, username_or_email))
        user = cursor.fetchone()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'success': False, 'message': 'Invalid username or password.'}), 401

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['full_name'] = user['full_name']

        return jsonify({
            'success': True,
            'message': f"Welcome back, {user['full_name']}!",
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name'],
                'theme_preference': user['theme_preference'],
                'avatar_color': user['avatar_color']
            }
        })
    finally:
        conn.close()

@app.route('/api/auth/demo', methods=['POST'])
def api_demo_login():
    """Instant 1-click Demo Account Login."""
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, username, email, full_name, theme_preference, avatar_color FROM users WHERE username = 'demo'")
        user = cursor.fetchone()

        if not user:
            database.seed_demo_user(conn)
            cursor.execute("SELECT id, username, email, full_name, theme_preference, avatar_color FROM users WHERE username = 'demo'")
            user = cursor.fetchone()

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['full_name'] = user['full_name']

        return jsonify({
            'success': True,
            'message': 'Logged in as Demo User!',
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name'],
                'theme_preference': user['theme_preference'],
                'avatar_color': user['avatar_color']
            }
        })
    finally:
        conn.close()

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Successfully logged out.'})

@app.route('/api/auth/me', methods=['GET'])
@login_required
def api_get_current_user():
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, username, email, full_name, theme_preference, avatar_color, created_at FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'success': False, 'message': 'User not found.'}), 404
        return jsonify({'success': True, 'user': dict(user)})
    finally:
        conn.close()

@app.route('/api/auth/theme', methods=['PUT'])
@login_required
def api_update_theme():
    user_id = get_current_user_id()
    data = request.get_json() or {}
    theme = data.get('theme', 'dark')
    if theme not in ['dark', 'light']:
        theme = 'dark'

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET theme_preference = ? WHERE id = ?", (theme, user_id))
        conn.commit()
        return jsonify({'success': True, 'theme': theme})
    finally:
        conn.close()

@app.route('/api/auth/profile', methods=['PUT'])
@login_required
def api_update_profile():
    user_id = get_current_user_id()
    data = request.get_json() or {}
    full_name = data.get('full_name', '').strip()
    avatar_color = data.get('avatar_color', '#6366f1')

    if not full_name:
        return jsonify({'success': False, 'message': 'Full name cannot be empty.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET full_name = ?, avatar_color = ? WHERE id = ?", (full_name, avatar_color, user_id))
        conn.commit()
        session['full_name'] = full_name
        return jsonify({'success': True, 'message': 'Profile updated successfully.'})
    finally:
        conn.close()

# ==========================================
# Dashboard & Analytics REST APIs
# ==========================================

@app.route('/api/dashboard/stats', methods=['GET'])
@login_required
def api_dashboard_stats():
    user_id = get_current_user_id()
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # Total tasks
        cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE user_id = ?", (user_id,))
        total_tasks = cursor.fetchone()['count']

        # Completed tasks
        cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND is_completed = 1", (user_id,))
        completed_tasks = cursor.fetchone()['count']

        # Pending / Not Done tasks
        cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND is_completed = 0", (user_id,))
        pending_tasks = cursor.fetchone()['count']

        # Due Today tasks
        cursor.execute("""
            SELECT COUNT(*) as count FROM tasks
            WHERE user_id = ? AND is_completed = 0 AND due_date = ?
        """, (user_id, today_str))
        due_today_tasks = cursor.fetchone()['count']

        # Overdue tasks
        cursor.execute("""
            SELECT COUNT(*) as count FROM tasks
            WHERE user_id = ? AND is_completed = 0 AND due_date < ? AND due_date IS NOT NULL AND due_date != ''
        """, (user_id, today_str))
        overdue_tasks = cursor.fetchone()['count']

        # Completion Rate (%)
        completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0

        # Tasks by Priority
        cursor.execute("""
            SELECT priority, COUNT(*) as count
            FROM tasks
            WHERE user_id = ?
            GROUP BY priority
        """, (user_id,))
        priority_map = {'urgent': 0, 'high': 0, 'medium': 0, 'low': 0}
        for row in cursor.fetchall():
            p = row['priority'].lower()
            if p in priority_map:
                priority_map[p] = row['count']

        # Tasks by Category
        cursor.execute("""
            SELECT c.id, c.name, c.color, c.icon, COUNT(t.id) as task_count,
                   SUM(CASE WHEN t.is_completed = 1 THEN 1 ELSE 0 END) as completed_count
            FROM categories c
            LEFT JOIN tasks t ON c.id = t.category_id AND t.user_id = ?
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY task_count DESC
        """, (user_id, user_id))
        category_stats = rows_to_list(cursor.fetchall())

        # Today's Focus / Upcoming Urgent Tasks (top 5)
        cursor.execute("""
            SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM tasks t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = ? AND t.is_completed = 0
            ORDER BY 
                CASE 
                    WHEN t.due_date = ? THEN 1
                    WHEN t.due_date < ? THEN 2
                    WHEN t.priority = 'urgent' THEN 3
                    WHEN t.priority = 'high' THEN 4
                    ELSE 5
                END,
                t.due_date ASC,
                t.due_time ASC
            LIMIT 5
        """, (user_id, today_str, today_str))
        upcoming_focus = rows_to_list(cursor.fetchall())

        # Weekly Activity (Past 7 days completed vs created)
        days = []
        for i in range(6, -1, -1):
            d = (now - timedelta(days=i)).strftime('%Y-%m-%d')
            day_name = (now - timedelta(days=i)).strftime('%a')
            
            cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND date(created_at) = ?", (user_id, d))
            created_c = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND date(completed_at) = ?", (user_id, d))
            completed_c = cursor.fetchone()['count']

            days.append({
                'date': d,
                'label': day_name,
                'created': created_c,
                'completed': completed_c
            })

        return jsonify({
            'success': True,
            'stats': {
                'total_tasks': total_tasks,
                'completed_tasks': completed_tasks,
                'pending_tasks': pending_tasks,
                'due_today_tasks': due_today_tasks,
                'overdue_tasks': overdue_tasks,
                'completion_rate': completion_rate,
                'priority_distribution': priority_map,
                'category_distribution': category_stats,
                'upcoming_focus': upcoming_focus,
                'weekly_activity': days
            }
        })
    finally:
        conn.close()

# ==========================================
# Tasks REST APIs
# ==========================================

@app.route('/api/tasks', methods=['GET'])
@login_required
def api_get_tasks():
    user_id = get_current_user_id()
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')

    # Query params
    search = request.args.get('search', '').strip()
    category_id = request.args.get('category_id')
    priority = request.args.get('priority')
    status = request.args.get('status')
    due_filter = request.args.get('due_filter', 'all')
    sort_by = request.args.get('sort_by', 'due_date')
    sort_order = request.args.get('sort_order', 'asc').upper()

    if sort_order not in ['ASC', 'DESC']:
        sort_order = 'ASC'

    query = """
        SELECT t.*, 
               c.name as category_name, 
               c.color as category_color, 
               c.icon as category_icon,
               (SELECT COUNT(*) FROM subtasks WHERE task_id = t.id) as subtask_total,
               (SELECT COUNT(*) FROM subtasks WHERE task_id = t.id AND is_completed = 1) as subtask_completed
        FROM tasks t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
    """
    params = [user_id]

    if search:
        query += " AND (t.title LIKE ? OR t.description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    if category_id and category_id.isdigit():
        query += " AND t.category_id = ?"
        params.append(int(category_id))

    if priority and priority in ['urgent', 'high', 'medium', 'low']:
        query += " AND t.priority = ?"
        params.append(priority)

    if status and status in ['pending', 'in_progress', 'completed']:
        query += " AND t.status = ?"
        params.append(status)

    if due_filter == 'today':
        query += " AND t.due_date = ?"
        params.append(today_str)
    elif due_filter == 'upcoming':
        query += " AND t.due_date > ?"
        params.append(today_str)
    elif due_filter == 'overdue':
        query += " AND t.due_date < ? AND t.is_completed = 0 AND t.due_date IS NOT NULL AND t.due_date != ''"
        params.append(today_str)
    elif due_filter == 'completed':
        query += " AND t.is_completed = 1"
    elif due_filter == 'pending':
        query += " AND t.is_completed = 0"

    # Sorting
    if sort_by == 'priority':
        query += f"""
            ORDER BY 
                CASE t.priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                    ELSE 5
                END {sort_order}, t.due_date ASC
        """
    elif sort_by == 'created':
        query += f" ORDER BY t.created_at {sort_order}"
    elif sort_by == 'title':
        query += f" ORDER BY t.title {sort_order}"
    else:  # due_date
        query += f"""
            ORDER BY 
                t.is_completed ASC,
                CASE WHEN t.due_date IS NULL OR t.due_date = '' THEN 1 ELSE 0 END,
                t.due_date {sort_order},
                t.due_time {sort_order}
        """

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(query, params)
        tasks = rows_to_list(cursor.fetchall())

        # Load subtasks for each task
        for task in tasks:
            cursor.execute("SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, id ASC", (task['id'],))
            task['subtasks'] = rows_to_list(cursor.fetchall())

        return jsonify({'success': True, 'tasks': tasks, 'total': len(tasks)})
    finally:
        conn.close()

@app.route('/api/tasks/<int:task_id>', methods=['GET'])
@login_required
def api_get_single_task(task_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM tasks t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ? AND t.user_id = ?
        """, (task_id, user_id))
        task = row_to_dict(cursor.fetchone())
        if not task:
            return jsonify({'success': False, 'message': 'Task not found.'}), 404

        cursor.execute("SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, id ASC", (task_id,))
        task['subtasks'] = rows_to_list(cursor.fetchall())

        return jsonify({'success': True, 'task': task})
    finally:
        conn.close()

def compute_reminder_time(due_date, due_time, reminder_offset):
    """Calculates reminder timestamp string based on due date, time, and offset."""
    if not due_date:
        return None
    time_str = due_time if due_time else "09:00"
    try:
        dt = datetime.strptime(f"{due_date} {time_str}", "%Y-%m-%d %H:%M")
        if reminder_offset == '10m_before':
            dt = dt - timedelta(minutes=10)
        elif reminder_offset == '30m_before':
            dt = dt - timedelta(minutes=30)
        elif reminder_offset == '1h_before':
            dt = dt - timedelta(hours=1)
        elif reminder_offset == '1d_before':
            dt = dt - timedelta(days=1)
        return dt.strftime('%Y-%m-%d %H:%M:00')
    except Exception:
        return None

@app.route('/api/tasks', methods=['POST'])
@login_required
def api_create_task():
    user_id = get_current_user_id()
    data = request.get_json() or {}

    title = data.get('title', '').strip()
    if not title:
        return jsonify({'success': False, 'message': 'Task title is required.'}), 400

    description = data.get('description', '').strip()
    category_id = data.get('category_id') or None
    priority = data.get('priority', 'medium')
    status = data.get('status', 'pending')
    due_date = data.get('due_date') or None
    due_time = data.get('due_time') or None
    estimated_minutes = int(data.get('estimated_minutes', 0) or 0)
    reminder_enabled = 1 if data.get('reminder_enabled') else 0
    reminder_offset = data.get('reminder_offset', 'at_time')
    recurrence = data.get('recurrence', 'none')
    subtasks = data.get('subtasks', [])

    reminder_time = compute_reminder_time(due_date, due_time, reminder_offset) if reminder_enabled else None

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO tasks (
                user_id, category_id, title, description, priority, status,
                is_completed, due_date, due_time, estimated_minutes,
                reminder_enabled, reminder_time, reminder_offset, recurrence
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, category_id, title, description, priority, status,
            due_date, due_time, estimated_minutes,
            reminder_enabled, reminder_time, reminder_offset, recurrence
        ))
        task_id = cursor.lastrowid

        # Insert subtasks
        for pos, st in enumerate(subtasks):
            st_title = st.get('title', '').strip() if isinstance(st, dict) else str(st).strip()
            if st_title:
                is_done = 1 if (isinstance(st, dict) and st.get('is_completed')) else 0
                cursor.execute("""
                    INSERT INTO subtasks (task_id, title, is_completed, position)
                    VALUES (?, ?, ?, ?)
                """, (task_id, st_title, is_done, pos))

        conn.commit()

        # Fetch created task
        cursor.execute("""
            SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM tasks t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        """, (task_id,))
        task = row_to_dict(cursor.fetchone())

        cursor.execute("SELECT * FROM subtasks WHERE task_id = ?", (task_id,))
        task['subtasks'] = rows_to_list(cursor.fetchall())

        return jsonify({'success': True, 'message': 'Task created successfully!', 'task': task}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': f'Error creating task: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@login_required
def api_update_task(task_id):
    user_id = get_current_user_id()
    data = request.get_json() or {}

    title = data.get('title', '').strip()
    if not title:
        return jsonify({'success': False, 'message': 'Task title cannot be empty.'}), 400

    description = data.get('description', '').strip()
    category_id = data.get('category_id') or None
    priority = data.get('priority', 'medium')
    status = data.get('status', 'pending')
    is_completed = 1 if (data.get('is_completed') or status == 'completed') else 0
    due_date = data.get('due_date') or None
    due_time = data.get('due_time') or None
    estimated_minutes = int(data.get('estimated_minutes', 0) or 0)
    reminder_enabled = 1 if data.get('reminder_enabled') else 0
    reminder_offset = data.get('reminder_offset', 'at_time')
    recurrence = data.get('recurrence', 'none')
    subtasks = data.get('subtasks', None)

    reminder_time = compute_reminder_time(due_date, due_time, reminder_offset) if reminder_enabled else None
    completed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S') if is_completed else None

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # Check task ownership
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        if not cursor.fetchone():
            return jsonify({'success': False, 'message': 'Task not found or unauthorized.'}), 404

        cursor.execute("""
            UPDATE tasks SET
                category_id = ?,
                title = ?,
                description = ?,
                priority = ?,
                status = ?,
                is_completed = ?,
                completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, ?) ELSE NULL END,
                due_date = ?,
                due_time = ?,
                estimated_minutes = ?,
                reminder_enabled = ?,
                reminder_time = ?,
                reminder_offset = ?,
                reminder_dismissed = 0,
                recurrence = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        """, (
            category_id, title, description, priority, status, is_completed,
            is_completed, completed_at, due_date, due_time, estimated_minutes,
            reminder_enabled, reminder_time, reminder_offset, recurrence,
            task_id, user_id
        ))

        # Update subtasks if provided
        if subtasks is not None:
            cursor.execute("DELETE FROM subtasks WHERE task_id = ?", (task_id,))
            for pos, st in enumerate(subtasks):
                st_title = st.get('title', '').strip() if isinstance(st, dict) else str(st).strip()
                if st_title:
                    is_done = 1 if (isinstance(st, dict) and st.get('is_completed')) else 0
                    cursor.execute("""
                        INSERT INTO subtasks (task_id, title, is_completed, position)
                        VALUES (?, ?, ?, ?)
                    """, (task_id, st_title, is_done, pos))

        conn.commit()

        cursor.execute("""
            SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM tasks t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        """, (task_id,))
        task = row_to_dict(cursor.fetchone())

        cursor.execute("SELECT * FROM subtasks WHERE task_id = ?", (task_id,))
        task['subtasks'] = rows_to_list(cursor.fetchall())

        return jsonify({'success': True, 'message': 'Task updated successfully!', 'task': task})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'message': f'Error updating task: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/tasks/<int:task_id>/toggle', methods=['POST'])
@login_required
def api_toggle_task_status(task_id):
    """Instantly toggle Done / Not Done status with celebration state."""
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, is_completed, title, recurrence, due_date FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        task = cursor.fetchone()
        if not task:
            return jsonify({'success': False, 'message': 'Task not found.'}), 404

        new_completed = 0 if task['is_completed'] == 1 else 1
        new_status = 'completed' if new_completed == 1 else 'pending'
        completed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S') if new_completed == 1 else None

        cursor.execute("""
            UPDATE tasks SET 
                is_completed = ?, 
                status = ?, 
                completed_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (new_completed, new_status, completed_at, task_id))

        # Also mark all subtasks if completed
        if new_completed == 1:
            cursor.execute("UPDATE subtasks SET is_completed = 1 WHERE task_id = ?", (task_id,))

        conn.commit()

        return jsonify({
            'success': True,
            'task_id': task_id,
            'is_completed': new_completed,
            'status': new_status,
            'message': f"Task marked as {'Completed' if new_completed else 'Pending'}!"
        })
    finally:
        conn.close()

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def api_delete_task(task_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'Task not found or already deleted.'}), 404
        conn.commit()
        return jsonify({'success': True, 'message': 'Task deleted successfully.'})
    finally:
        conn.close()

# ==========================================
# Subtask REST APIs
# ==========================================

@app.route('/api/tasks/<int:task_id>/subtasks', methods=['POST'])
@login_required
def api_add_subtask(task_id):
    user_id = get_current_user_id()
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    if not title:
        return jsonify({'success': False, 'message': 'Subtask title cannot be empty.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        if not cursor.fetchone():
            return jsonify({'success': False, 'message': 'Task not found.'}), 404

        cursor.execute("SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM subtasks WHERE task_id = ?", (task_id,))
        next_pos = cursor.fetchone()['next_pos']

        cursor.execute("""
            INSERT INTO subtasks (task_id, title, is_completed, position)
            VALUES (?, ?, 0, ?)
        """, (task_id, title, next_pos))
        subtask_id = cursor.lastrowid
        conn.commit()

        return jsonify({
            'success': True,
            'subtask': {
                'id': subtask_id,
                'task_id': task_id,
                'title': title,
                'is_completed': 0,
                'position': next_pos
            }
        }), 201
    finally:
        conn.close()

@app.route('/api/subtasks/<int:subtask_id>/toggle', methods=['POST'])
@login_required
def api_toggle_subtask(subtask_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT s.id, s.is_completed, s.task_id
            FROM subtasks s
            JOIN tasks t ON s.task_id = t.id
            WHERE s.id = ? AND t.user_id = ?
        """, (subtask_id, user_id))
        st = cursor.fetchone()
        if not st:
            return jsonify({'success': False, 'message': 'Subtask not found.'}), 404

        new_status = 0 if st['is_completed'] == 1 else 1
        cursor.execute("UPDATE subtasks SET is_completed = ? WHERE id = ?", (new_status, subtask_id))
        conn.commit()

        # Check total vs completed for this task
        cursor.execute("SELECT COUNT(*) as total, SUM(is_completed) as completed FROM subtasks WHERE task_id = ?", (st['task_id'],))
        counts = cursor.fetchone()

        return jsonify({
            'success': True,
            'subtask_id': subtask_id,
            'is_completed': new_status,
            'progress': {
                'total': counts['total'],
                'completed': counts['completed'] or 0
            }
        })
    finally:
        conn.close()

@app.route('/api/subtasks/<int:subtask_id>', methods=['DELETE'])
@login_required
def api_delete_subtask(subtask_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT s.id
            FROM subtasks s
            JOIN tasks t ON s.task_id = t.id
            WHERE s.id = ? AND t.user_id = ?
        """, (subtask_id, user_id))
        if not cursor.fetchone():
            return jsonify({'success': False, 'message': 'Subtask not found.'}), 404

        cursor.execute("DELETE FROM subtasks WHERE id = ?", (subtask_id,))
        conn.commit()
        return jsonify({'success': True, 'message': 'Subtask deleted.'})
    finally:
        conn.close()

# ==========================================
# Category REST APIs
# ==========================================

@app.route('/api/categories', methods=['GET'])
@login_required
def api_get_categories():
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT c.*, 
                   COUNT(t.id) as total_tasks,
                   SUM(CASE WHEN t.is_completed = 1 THEN 1 ELSE 0 END) as completed_tasks,
                   SUM(CASE WHEN t.is_completed = 0 THEN 1 ELSE 0 END) as active_tasks
            FROM categories c
            LEFT JOIN tasks t ON c.id = t.category_id AND t.user_id = ?
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY c.name ASC
        """, (user_id, user_id))
        categories = rows_to_list(cursor.fetchall())
        return jsonify({'success': True, 'categories': categories})
    finally:
        conn.close()

@app.route('/api/categories', methods=['POST'])
@login_required
def api_create_category():
    user_id = get_current_user_id()
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    color = data.get('color', '#6366f1').strip()
    icon = data.get('icon', 'fa-tag').strip()

    if not name:
        return jsonify({'success': False, 'message': 'Category name is required.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # Check duplicate category name
        cursor.execute("SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = ?", (user_id, name.lower()))
        if cursor.fetchone():
            return jsonify({'success': False, 'message': 'A category with this name already exists.'}), 409

        cursor.execute("""
            INSERT INTO categories (user_id, name, color, icon)
            VALUES (?, ?, ?, ?)
        """, (user_id, name, color, icon))
        cat_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM categories WHERE id = ?", (cat_id,))
        new_cat = row_to_dict(cursor.fetchone())
        new_cat['total_tasks'] = 0
        new_cat['completed_tasks'] = 0
        new_cat['active_tasks'] = 0

        return jsonify({'success': True, 'message': 'Category created successfully!', 'category': new_cat}), 201
    finally:
        conn.close()

@app.route('/api/categories/<int:category_id>', methods=['PUT'])
@login_required
def api_update_category(category_id):
    user_id = get_current_user_id()
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    color = data.get('color', '#6366f1').strip()
    icon = data.get('icon', 'fa-tag').strip()

    if not name:
        return jsonify({'success': False, 'message': 'Category name cannot be empty.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM categories WHERE id = ? AND user_id = ?", (category_id, user_id))
        if not cursor.fetchone():
            return jsonify({'success': False, 'message': 'Category not found.'}), 404

        # Check duplicate name
        cursor.execute("SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = ? AND id != ?", (user_id, name.lower(), category_id))
        if cursor.fetchone():
            return jsonify({'success': False, 'message': 'Another category with this name already exists.'}), 409

        cursor.execute("""
            UPDATE categories SET name = ?, color = ?, icon = ?
            WHERE id = ? AND user_id = ?
        """, (name, color, icon, category_id, user_id))
        conn.commit()

        cursor.execute("SELECT * FROM categories WHERE id = ?", (category_id,))
        updated_cat = row_to_dict(cursor.fetchone())
        return jsonify({'success': True, 'message': 'Category updated successfully!', 'category': updated_cat})
    finally:
        conn.close()

@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
@login_required
def api_delete_category(category_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name FROM categories WHERE id = ? AND user_id = ?", (category_id, user_id))
        cat = cursor.fetchone()
        if not cat:
            return jsonify({'success': False, 'message': 'Category not found.'}), 404

        # Disassociate tasks (set category_id to NULL)
        cursor.execute("UPDATE tasks SET category_id = NULL WHERE category_id = ? AND user_id = ?", (category_id, user_id))
        cursor.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        conn.commit()

        return jsonify({'success': True, 'message': f'Category "{cat["name"]}" removed. Tasks are now uncategorized.'})
    finally:
        conn.close()

@app.route('/api/categories/remove-all', methods=['POST'])
@login_required
def api_remove_all_categories():
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        # Disassociate tasks (set category_id to NULL)
        cursor.execute("UPDATE tasks SET category_id = NULL WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
        conn.commit()
        return jsonify({'success': True, 'message': 'All categories have been removed. All tasks are kept safe.'})
    finally:
        conn.close()

@app.route('/api/categories/restore-defaults', methods=['POST'])
@login_required
def api_restore_default_categories():
    user_id = get_current_user_id()
    conn = database.get_db()
    try:
        database.create_default_categories_for_user(user_id, conn)
        return jsonify({'success': True, 'message': 'Suggested default categories restored successfully.'})
    finally:
        conn.close()

# ==========================================
# Reminders & Notifications REST APIs
# ==========================================

@app.route('/api/reminders/due', methods=['GET'])
@login_required
def api_get_due_reminders():
    """Returns active tasks that have reached or passed their reminder threshold."""
    user_id = get_current_user_id()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM tasks t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = ? 
              AND t.is_completed = 0 
              AND t.reminder_enabled = 1 
              AND t.reminder_dismissed = 0
              AND t.reminder_time IS NOT NULL
              AND t.reminder_time <= ?
            ORDER BY t.reminder_time ASC
        """, (user_id, now_str))
        due_reminders = rows_to_list(cursor.fetchall())
        return jsonify({'success': True, 'reminders': due_reminders, 'count': len(due_reminders)})
    finally:
        conn.close()

@app.route('/api/reminders/<int:task_id>/snooze', methods=['POST'])
@login_required
def api_snooze_reminder(task_id):
    user_id = get_current_user_id()
    data = request.get_json() or {}
    minutes = int(data.get('minutes', 10))

    new_time = (datetime.now() + timedelta(minutes=minutes)).strftime('%Y-%m-%d %H:%M:%S')

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE tasks SET 
                reminder_time = ?, 
                reminder_dismissed = 0 
            WHERE id = ? AND user_id = ?
        """, (new_time, task_id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': f'Reminder snoozed for {minutes} minutes.', 'new_reminder_time': new_time})
    finally:
        conn.close()

@app.route('/api/reminders/<int:task_id>/dismiss', methods=['POST'])
@login_required
def api_dismiss_reminder(task_id):
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE tasks SET reminder_dismissed = 1 WHERE id = ? AND user_id = ?", (task_id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Reminder dismissed.'})
    finally:
        conn.close()

@app.route('/api/notifications', methods=['GET'])
@login_required
def api_get_notifications():
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT * FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 30
        """, (user_id,))
        notifs = rows_to_list(cursor.fetchall())

        cursor.execute("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0", (user_id,))
        unread_count = cursor.fetchone()['unread']

        return jsonify({'success': True, 'notifications': notifs, 'unread_count': unread_count})
    finally:
        conn.close()

@app.route('/api/notifications/mark-read', methods=['POST'])
@login_required
def api_mark_notifications_read():
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
        conn.commit()
        return jsonify({'success': True, 'message': 'Notifications marked as read.'})
    finally:
        conn.close()

# ==========================================
# Calendar Events REST APIs
# ==========================================

@app.route('/api/calendar/events', methods=['GET'])
@login_required
def api_get_calendar_events():
    user_id = get_current_user_id()
    year_month = request.args.get('month')  # e.g., '2026-09'

    query = """
        SELECT t.id, t.title, t.priority, t.status, t.is_completed, t.due_date, t.due_time,
               c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM tasks t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.due_date IS NOT NULL AND t.due_date != ''
    """
    params = [user_id]

    if year_month:
        query += " AND t.due_date LIKE ?"
        params.append(f"{year_month}%")

    query += " ORDER BY t.due_date ASC, t.due_time ASC"

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(query, params)
        events = rows_to_list(cursor.fetchall())
        return jsonify({'success': True, 'events': events})
    finally:
        conn.close()

# ==========================================
# Batch Operations & Export
# ==========================================

@app.route('/api/tasks/batch-action', methods=['POST'])
@login_required
def api_batch_task_action():
    user_id = get_current_user_id()
    data = request.get_json() or {}
    task_ids = data.get('task_ids', [])
    action = data.get('action')  # 'complete', 'incomplete', 'delete', 'set_category'
    category_id = data.get('category_id')

    if not task_ids or not action:
        return jsonify({'success': False, 'message': 'task_ids and action are required.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    try:
        placeholders = ','.join(['?'] * len(task_ids))
        if action == 'complete':
            now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(f"UPDATE tasks SET is_completed = 1, status = 'completed', completed_at = ? WHERE id IN ({placeholders}) AND user_id = ?", [now_str] + task_ids + [user_id])
            cursor.execute(f"UPDATE subtasks SET is_completed = 1 WHERE task_id IN ({placeholders})", task_ids)
        elif action == 'incomplete':
            cursor.execute(f"UPDATE tasks SET is_completed = 0, status = 'pending', completed_at = NULL WHERE id IN ({placeholders}) AND user_id = ?", task_ids + [user_id])
        elif action == 'delete':
            cursor.execute(f"DELETE FROM tasks WHERE id IN ({placeholders}) AND user_id = ?", task_ids + [user_id])
        elif action == 'set_category':
            cursor.execute(f"UPDATE tasks SET category_id = ? WHERE id IN ({placeholders}) AND user_id = ?", [category_id] + task_ids + [user_id])

        conn.commit()
        return jsonify({'success': True, 'message': f'Batch operation {action} succeeded on {len(task_ids)} tasks.'})
    finally:
        conn.close()

@app.route('/api/export/json', methods=['GET'])
@login_required
def api_export_json():
    user_id = get_current_user_id()
    conn = database.get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = row_to_dict(cursor.fetchone())
        if user:
            user.pop('password_hash', None)

        cursor.execute("SELECT * FROM categories WHERE user_id = ?", (user_id,))
        categories = rows_to_list(cursor.fetchall())

        cursor.execute("SELECT * FROM tasks WHERE user_id = ?", (user_id,))
        tasks = rows_to_list(cursor.fetchall())

        for t in tasks:
            cursor.execute("SELECT * FROM subtasks WHERE task_id = ?", (t['id'],))
            t['subtasks'] = rows_to_list(cursor.fetchall())

        payload = {
            'exported_at': datetime.now().isoformat(),
            'app': 'MyEstia Personal Task and Reminder System',
            'user': user,
            'categories': categories,
            'tasks': tasks
        }
        return jsonify(payload)
    finally:
        conn.close()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='127.0.0.1', port=port, debug=True)
