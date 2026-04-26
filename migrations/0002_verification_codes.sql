-- Verification codes table for email verification
-- Supports registration and email update flows

CREATE TABLE IF NOT EXISTS verification_codes (
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (purpose, email)
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
CREATE TABLE IF NOT EXISTS verification_code_cooldowns (
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (purpose, email)
);
