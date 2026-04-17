"""
SQLite database layer using aiosqlite.

Each feature team (assets, expenses, goals, chat, dashboard) imports `get_db`
from here. Schema creation is idempotent — `init_db()` runs on app startup
and is safe to call against an existing DB.
"""
import aiosqlite
from pathlib import Path

DB_PATH = Path(__file__).parent / "wealthmate.db"


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT,
    salary INTEGER,
    join_year INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    return_rate REAL DEFAULT 0.0,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id),
    month TEXT NOT NULL,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    UNIQUE(user_id, month, category)
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id),
    target_amount INTEGER,
    target_year INTEGER,
    start_amount INTEGER,
    start_date TEXT
);

CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    user_id TEXT
);

-- Extra (non-salary) income events: bonuses, allowances, one-off payouts.
-- Unlike expenses, same (user, month) can have many rows (label differs),
-- so no uniqueness constraint — each entry is its own record.
CREATE TABLE IF NOT EXISTS incomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id),
    month TEXT NOT NULL,
    label TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_incomes_user_month ON incomes(user_id, month);
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
