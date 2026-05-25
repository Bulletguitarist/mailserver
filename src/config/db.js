const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const query = async (text, params) => {
  const result = await pool.query(text, params);
  return result;
};

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              TEXT PRIMARY KEY,
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
        created_at      TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
        updated_at      TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id              TEXT PRIMARY KEY,
        owner_id        TEXT NOT NULL,
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
        spam_score      FLOAT DEFAULT 0.0,
        is_spam         INTEGER DEFAULT 0,
        message_id      TEXT UNIQUE,
        in_reply_to     TEXT,
        thread_id       TEXT,
        attachments     TEXT DEFAULT '[]',
        sent_at         TEXT,
        received_at     TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
        created_at      TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          TEXT PRIMARY KEY,
        user_id     TEXT,
        action      TEXT NOT NULL,
        ip_address  TEXT,
        user_agent  TEXT,
        metadata    TEXT DEFAULT '{}',
        created_at  TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        token_hash  TEXT NOT NULL,
        ip_address  TEXT,
        user_agent  TEXT,
        expires_at  TEXT NOT NULL,
        created_at  TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_owner ON emails(owner_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(owner_id, folder)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)`);

    logger.info('✅ PostgreSQL database ready');
  } catch (err) {
    logger.error('DB init error: ' + err.message);
    throw err;
  }
};

module.exports = { pool, query, initDb };