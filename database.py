"""
Database management module for MyEstia - Personal Task and Reminder System.
Uses SQLite with dict-like row factories and relational foreign key support.
"""

import sqlite3
import os
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash

def get_db_path():
    """Returns the database file path, supporting serverless /tmp environments."""
    if os.environ.get('DATABASE_PATH'):
        return os.environ.get('DATABASE_PATH')
    if os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME') or os.environ.get('NOW_REGION'):
        return '/tmp/myestia.db'
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'myestia.db')

DB_PATH = get_db_path()

DEFAULT_CATEGORIES = [
    {"name": "Work", "color": "#6366f1", "icon": "fa-briefcase"},
    {"name": "Study", "color": "#06b6d4", "icon": "fa-graduation-cap"},
    {"name": "Personal", "color": "#ec4899", "icon": "fa-user"},
    {"name": "Health", "color": "#10b981", "icon": "fa-heart-pulse"},
    {"name": "Finance", "color": "#f59e0b", "icon": "fa-wallet"},
    {"name": "Projects", "color": "#8b5cf6", "icon": "fa-rocket"},
    {"name": "Shopping", "color": "#3b82f6", "icon": "fa-cart-shopping"}
]

def get_db():
    """Returns a SQLite connection configured with dict-like Row factory."""
    db_path = get_db_path()
    is_new = not os.path.exists(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if is_new:
        init_db(conn)
    return conn

def init_db(conn=None):
    """Creates database tables and indexes if they do not already exist."""
    should_close = False
    if conn is None:
        conn = sqlite3.connect(get_db_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        should_close = True

    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            theme_preference TEXT DEFAULT 'dark',
            avatar_color TEXT DEFAULT '#6366f1',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6366f1',
            icon TEXT NOT NULL DEFAULT 'fa-tag',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category_id INTEGER,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'pending',
            is_completed INTEGER NOT NULL DEFAULT 0,
            completed_at TIMESTAMP,
            due_date TEXT,
            due_time TEXT,
            estimated_minutes INTEGER DEFAULT 0,
            reminder_enabled INTEGER DEFAULT 0,
            reminder_time TEXT,
            reminder_offset TEXT DEFAULT 'at_time',
            reminder_dismissed INTEGER DEFAULT 0,
            recurrence TEXT DEFAULT 'none',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            is_completed INTEGER NOT NULL DEFAULT 0,
            position INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'reminder',
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);
        CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
        CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
        CREATE INDEX IF NOT EXISTS idx_notifs_user_id ON notifications(user_id);
    """)

    conn.commit()

    # Seed demo user if no users exist
    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    count = cursor.fetchone()['cnt']
    if count == 0:
        seed_demo_user(conn)

    if should_close:
        conn.close()

def seed_demo_user(conn=None):
    """Creates a demo user with realistic categories, tasks, subtasks, and reminders."""
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True

    cursor = conn.cursor()
    demo_password_hash = generate_password_hash("password123")

    try:
        cursor.execute("""
            INSERT INTO users (username, email, password_hash, full_name, theme_preference, avatar_color)
            VALUES (?, ?, ?, ?, 'dark', '#6366f1')
        """, ("demo", "demo@myestia.app", demo_password_hash, "Alex Morgan"))
        user_id = cursor.lastrowid

        # Insert default categories for demo user
        cat_ids = {}
        for cat in DEFAULT_CATEGORIES:
            cursor.execute("""
                INSERT INTO categories (user_id, name, color, icon)
                VALUES (?, ?, ?, ?)
            """, (user_id, cat["name"], cat["color"], cat["icon"]))
            cat_ids[cat["name"]] = cursor.lastrowid

        now = datetime.now()
        today_str = now.strftime('%Y-%m-%d')
        tomorrow_str = (now + timedelta(days=1)).strftime('%Y-%m-%d')
        day_after_str = (now + timedelta(days=2)).strftime('%Y-%m-%d')
        yesterday_str = (now - timedelta(days=1)).strftime('%Y-%m-%d')
        next_week_str = (now + timedelta(days=5)).strftime('%Y-%m-%d')

        # Sample tasks
        sample_tasks = [
            {
                "title": "Finalize Q3 Project Architecture Report",
                "description": "Review system modularity, database indexing strategy, and microservices diagram for executive review.",
                "category": "Work",
                "priority": "urgent",
                "status": "in_progress",
                "is_completed": 0,
                "due_date": today_str,
                "due_time": "15:00",
                "estimated_minutes": 90,
                "reminder_enabled": 1,
                "reminder_time": f"{today_str} 14:30:00",
                "reminder_offset": "10m_before",
                "recurrence": "none",
                "subtasks": [
                    ("Draft introduction & executive summary", 1),
                    ("Export architecture diagram high-res PNG", 1),
                    ("Double-check latency benchmark tables", 0),
                    ("Send to project stakeholders for signoff", 0)
                ]
            },
            {
                "title": "Study Deep Learning Optimization Algorithms",
                "description": "Chapter 8: AdamW, Learning Rate Schedulers, and Weight Decay dynamics in Transformer models.",
                "category": "Study",
                "priority": "high",
                "status": "pending",
                "is_completed": 0,
                "due_date": today_str,
                "due_time": "19:00",
                "estimated_minutes": 60,
                "reminder_enabled": 1,
                "reminder_time": f"{today_str} 18:30:00",
                "reminder_offset": "10m_before",
                "recurrence": "none",
                "subtasks": [
                    ("Read pages 210 to 245", 0),
                    ("Code simple PyTorch momentum experiment", 0),
                    ("Write 3 summary flashcards", 0)
                ]
            },
            {
                "title": "Morning HIIT Cardio & Stretch",
                "description": "30-minute interval workout followed by 10 minutes full-body mobility and deep breathing.",
                "category": "Health",
                "priority": "medium",
                "status": "completed",
                "is_completed": 1,
                "completed_at": f"{today_str} 07:45:00",
                "due_date": today_str,
                "due_time": "07:00",
                "estimated_minutes": 40,
                "reminder_enabled": 0,
                "reminder_time": None,
                "reminder_offset": "at_time",
                "recurrence": "daily",
                "subtasks": [
                    ("Warmup & jump rope", 1),
                    ("Tabata intervals (4 rounds)", 1),
                    ("Hydrate with electrolytes", 1)
                ]
            },
            {
                "title": "Monthly Investment & Budget Review",
                "description": "Track savings rate, balance index fund contributions, and audit recurring subscriptions.",
                "category": "Finance",
                "priority": "medium",
                "status": "pending",
                "is_completed": 0,
                "due_date": tomorrow_str,
                "due_time": "18:00",
                "estimated_minutes": 45,
                "reminder_enabled": 1,
                "reminder_time": f"{tomorrow_str} 17:00:00",
                "reminder_offset": "1h_before",
                "recurrence": "monthly",
                "subtasks": [
                    ("Download monthly bank statements", 0),
                    ("Update personal net worth spreadsheet", 0),
                    ("Transfer $500 to index fund", 0)
                ]
            },
            {
                "title": "Grocery Shopping: Fresh Veggies & Meal Prep",
                "description": "Stock up on organic produce, chicken breast, oats, and greek yogurt for the coming week.",
                "category": "Shopping",
                "priority": "low",
                "status": "pending",
                "is_completed": 0,
                "due_date": day_after_str,
                "due_time": "11:30",
                "estimated_minutes": 45,
                "reminder_enabled": 0,
                "reminder_time": None,
                "reminder_offset": "at_time",
                "recurrence": "weekly",
                "subtasks": [
                    ("Spinach and Bell Peppers", 0),
                    ("Free-range eggs", 0),
                    ("Almond milk & berries", 0)
                ]
            },
            {
                "title": "Submit Quarterly Tax Documentation",
                "description": "Submit receipts and business expense deductions to accountant portal.",
                "category": "Finance",
                "priority": "urgent",
                "status": "pending",
                "is_completed": 0,
                "due_date": yesterday_str,
                "due_time": "17:00",
                "estimated_minutes": 60,
                "reminder_enabled": 1,
                "reminder_time": f"{yesterday_str} 16:00:00",
                "reminder_offset": "1h_before",
                "recurrence": "none",
                "subtasks": [
                    ("Gather PDF invoices", 1),
                    ("Fill accountant checklist", 0)
                ]
            },
            {
                "title": "Deploy MyEstia Task System to Production",
                "description": "Verify zero linter errors, configure SQLite indexing, check dark/light aesthetics and mobile layout.",
                "category": "Projects",
                "priority": "high",
                "status": "in_progress",
                "is_completed": 0,
                "due_date": next_week_str,
                "due_time": "14:00",
                "estimated_minutes": 120,
                "reminder_enabled": 1,
                "reminder_time": f"{next_week_str} 13:00:00",
                "reminder_offset": "1h_before",
                "recurrence": "none",
                "subtasks": [
                    ("Write unit & API integration tests", 1),
                    ("Verify reminder audio synth", 1),
                    ("Launch with run.py script", 0)
                ]
            }
        ]

        for t in sample_tasks:
            cat_id = cat_ids.get(t["category"])
            cursor.execute("""
                INSERT INTO tasks (
                    user_id, category_id, title, description, priority, status,
                    is_completed, completed_at, due_date, due_time, estimated_minutes,
                    reminder_enabled, reminder_time, reminder_offset, recurrence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, cat_id, t["title"], t["description"], t["priority"], t["status"],
                t["is_completed"], t.get("completed_at"), t["due_date"], t["due_time"],
                t["estimated_minutes"], t["reminder_enabled"], t["reminder_time"],
                t["reminder_offset"], t["recurrence"]
            ))
            task_id = cursor.lastrowid

            # Insert subtasks
            for pos, (st_title, st_done) in enumerate(t.get("subtasks", [])):
                cursor.execute("""
                    INSERT INTO subtasks (task_id, title, is_completed, position)
                    VALUES (?, ?, ?, ?)
                """, (task_id, st_title, st_done, pos))

        # Insert starter notification
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type, is_read)
            VALUES (?, ?, ?, 'system', 0)
        """, (user_id, "Welcome to MyEstia!", "Welcome Alex! Explore your dashboard, organize tasks by categories, and stay ahead with real-time reminders."))

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Error seeding demo data: {e}")
    finally:
        if should_close:
            conn.close()

def create_default_categories_for_user(user_id, conn):
    """Creates default category set for newly registered users, preventing duplicates."""
    cursor = conn.cursor()
    for cat in DEFAULT_CATEGORIES:
        cursor.execute("SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = ?", (user_id, cat["name"].lower()))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO categories (user_id, name, color, icon)
                VALUES (?, ?, ?, ?)
            """, (user_id, cat["name"], cat["color"], cat["icon"]))
    conn.commit()

if __name__ == "__main__":
    init_db()
    print(f"MyEstia database initialized at: {DB_PATH}")
