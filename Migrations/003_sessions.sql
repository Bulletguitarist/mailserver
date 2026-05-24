CREATE TYPE audit_action AS ENUM (
  'login_success', 'login_failed', 'logout',
  'otp_setup', 'otp_verified', 'otp_failed',
  'password_changed', 'email_sent', 'email_deleted',
  'token_refreshed', 'token_revoked', 'suspicious_activity'
);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      audit_action NOT NULL,

  -- Network context
  ip_address  INET,
  user_agent  TEXT,
  country     VARCHAR(2),                     -- ISO country from IP geo

  -- Extra payload (e.g. failed reason, affected resource)
  metadata    JSONB DEFAULT '{}',

  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user   ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_ip     ON audit_logs(ip_address);

-- Partition hint: in production, partition this table by month
-- CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');