# ══════════════════════════════════════════
#   SERENITY RADIO — db.py
#   SQLite database — free, built into Python
#   No extra installation needed
# ══════════════════════════════════════════

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'serenity.db')


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # lets us access columns by name
    return conn


def init_db():
    """Create all tables if they don't already exist."""
    conn = get_connection()
    c    = conn.cursor()

    # Donations — recorded from Buy Me a Coffee webhook
    c.execute('''
        CREATE TABLE IF NOT EXISTS donations (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            amount         REAL    NOT NULL,
            supporter_name TEXT    DEFAULT "Anonymous",
            message        TEXT    DEFAULT "",
            bmc_id         TEXT    UNIQUE,
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Subscribers — daily quote email list
    c.execute('''
        CREATE TABLE IF NOT EXISTS subscribers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT UNIQUE NOT NULL,
            name       TEXT DEFAULT "",
            reason     TEXT DEFAULT "",
            active     INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Music upload submissions (pending review)
    c.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            artist      TEXT NOT NULL,
            email       TEXT NOT NULL,
            title       TEXT NOT NULL,
            genre       TEXT DEFAULT "",
            filename    TEXT NOT NULL,
            status      TEXT DEFAULT "pending",
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Donate-button click analytics
    c.execute('''
        CREATE TABLE IF NOT EXISTS donate_clicks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    print("Database initialised at", DB_PATH)


# ── Donation helpers ──

def get_donation_totals():
    """Returns (total_amount, count) from the donations table."""
    conn  = get_connection()
    c     = conn.cursor()
    c.execute('SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM donations')
    total, count = c.fetchone()
    conn.close()
    return float(total), int(count)


def add_donation(amount, name='Anonymous', message='', bmc_id=None):
    conn = get_connection()
    c    = conn.cursor()
    try:
        c.execute(
            'INSERT INTO donations (amount, supporter_name, message, bmc_id) VALUES (?, ?, ?, ?)',
            (amount, name, message, bmc_id)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # Duplicate BMC webhook — ignore
        return False
    finally:
        conn.close()


# ── Subscriber helpers ──

def add_subscriber(email, name='', reason=''):
    conn = get_connection()
    c    = conn.cursor()
    try:
        c.execute(
            'INSERT INTO subscribers (email, name, reason) VALUES (?, ?, ?)',
            (email.lower().strip(), name.strip(), reason)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False   # already subscribed
    finally:
        conn.close()


def get_subscriber_count():
    conn  = get_connection()
    c     = conn.cursor()
    c.execute('SELECT COUNT(*) FROM subscribers WHERE active = 1')
    count = c.fetchone()[0]
    conn.close()
    return count


# ── Submission helpers ──

def add_submission(artist, email, title, genre, filename):
    conn = get_connection()
    c    = conn.cursor()
    c.execute(
        'INSERT INTO submissions (artist, email, title, genre, filename) VALUES (?, ?, ?, ?, ?)',
        (artist, email, title, genre, filename)
    )
    conn.commit()
    conn.close()


# ── Analytics helpers ──

def record_donate_click():
    conn = get_connection()
    c    = conn.cursor()
    c.execute('INSERT INTO donate_clicks DEFAULT VALUES')
    conn.commit()
    conn.close()
