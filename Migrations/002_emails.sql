CREATE TYPE email_status AS ENUM ('queued', 'sent', 'failed', 'received');
CREATE TYPE email_folder AS ENUM ('inbox', 'sent', 'drafts', 'trash', 'spam');

CREATE TABLE emails (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Parties
  from_address    VARCHAR(255) NOT NULL,
  to_addresses    TEXT[] NOT NULL,             -- array of recipients
  cc_addresses    TEXT[] DEFAULT '{}',
  bcc_addresses   TEXT[] DEFAULT '{}',

  -- Content (body stored encrypted)
  subject         TEXT,
  body_encrypted  TEXT NOT NULL,               -- libsodium sealed box (base64)
  body_iv         TEXT,                        -- nonce (base64)
  is_encrypted    BOOLEAN DEFAULT TRUE,

  -- Metadata
  folder          email_folder DEFAULT 'inbox',
  status          email_status DEFAULT 'received',
  is_read         BOOLEAN DEFAULT FALSE,
  is_starred      BOOLEAN DEFAULT FALSE,
  spam_score      FLOAT DEFAULT 0.0,
  is_spam         BOOLEAN DEFAULT FALSE,

  -- SMTP/IMAP bookkeeping
  message_id      TEXT UNIQUE,                 -- RFC 2822 Message-ID
  in_reply_to     TEXT,
  thread_id       UUID,

  -- Attachments stored as Maildir paths
  attachments     JSONB DEFAULT '[]',

  sent_at         TIMESTAMPTZ,
  received_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emails_owner    ON emails(owner_id);
CREATE INDEX idx_emails_folder   ON emails(owner_id, folder);
CREATE INDEX idx_emails_thread   ON emails(thread_id);
CREATE INDEX idx_emails_received ON emails(received_at DESC);