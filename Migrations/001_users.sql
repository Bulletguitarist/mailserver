CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  display_name    VARCHAR(100),

  -- OTP / 2FA
  otp_secret      TEXT,                        -- encrypted TOTP secret
  otp_enabled     BOOLEAN DEFAULT FALSE,
  otp_verified_at TIMESTAMPTZ,

  -- Public key for E2E encryption
  public_key      TEXT,                        -- libsodium public key (base64)

  -- Account state
  is_active       BOOLEAN DEFAULT TRUE,
  is_admin        BOOLEAN DEFAULT FALSE,
  email_verified  BOOLEAN DEFAULT FALSE,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup by email
CREATE INDEX idx_users_email ON users(email);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();