const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Create data directory if not exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'mailserver.db'), {
  verbose: process.env.NODE_ENV === 'development' ? console.log : null,
});

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Create all tables ──────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    otp_secret      TEXT,
    otp_enabled     INTEGER DEFAULT 0,
    otp_verified_at TEXT,
    public_key      TEXT,
    is_active       INTEGER DEFAULT 1,
    is_admin        INTEGER DEFAULT 0,
    email_verified  INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS emails (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_address    TEXT NOT NULL,
    to_addresses    TEXT NOT NULL,
    cc_addresses    TEXT DEFAULT '[]',
    bcc_addresses   TEXT DEFAULT '[]',
    subject         TEXT,
    body_encrypted  TEXT NOT NULL,
    body_iv         TEXT,
    is_encrypted    INTEGER DEFAULT 1,
    folder          TEXT DEFAULT 'inbox',
    status          TEXT DEFAULT 'received',
    is_read         INTEGER DEFAULT 0,
    is_starred      INTEGER DEFAULT 0,
    spam_score      REAL DEFAULT 0.0,
    is_spam         INTEGER DEFAULT 0,
    message_id      TEXT UNIQUE,
    in_reply_to     TEXT,
    thread_id       TEXT,
    attachments     TEXT DEFAULT '[]',
    sent_at         TEXT,
    received_at     TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    ip_address  TEXT,
    user_agent  TEXT,
    metadata    TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    ip_address  TEXT,
    user_agent  TEXT,
    expires_at  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
  CREATE INDEX IF NOT EXISTS idx_emails_owner     ON emails(owner_id);
  CREATE INDEX IF NOT EXISTS idx_emails_folder    ON emails(owner_id, folder);
  CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
`);

console.log('✅ SQLite database ready at data/mailserver.db');

module.exports = db;