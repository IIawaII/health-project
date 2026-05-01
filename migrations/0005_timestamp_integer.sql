-- Migration: Convert all timestamp columns from TEXT (ISO 8601) to INTEGER (Unix timestamp in seconds)
-- Note: This rebuilds all tables because SQLite ALTER TABLE does not support changing column types.

-- 1. users table
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  accountname TEXT,
  role TEXT DEFAULT 'user',
  data_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO users_new
SELECT id, username, email, password_hash, avatar, accountname, role, data_key,
       COALESCE(strftime('%s', created_at), strftime('%s', 'now')),
       COALESCE(strftime('%s', updated_at), strftime('%s', 'now'))
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_data_key ON users(data_key);

-- 2. verification_codes table
CREATE TABLE verification_codes_new (
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (purpose, email)
);

INSERT INTO verification_codes_new
SELECT purpose, email, code, attempts,
       COALESCE(strftime('%s', created_at), strftime('%s', 'now')),
       COALESCE(strftime('%s', expires_at), strftime('%s', 'now') + 180)
FROM verification_codes;

DROP TABLE verification_codes;
ALTER TABLE verification_codes_new RENAME TO verification_codes;

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- 3. verification_code_cooldowns table
CREATE TABLE verification_code_cooldowns_new (
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (purpose, email)
);

INSERT INTO verification_code_cooldowns_new
SELECT purpose, email,
       COALESCE(strftime('%s', sent_at), strftime('%s', 'now'))
FROM verification_code_cooldowns;

DROP TABLE verification_code_cooldowns;
ALTER TABLE verification_code_cooldowns_new RENAME TO verification_code_cooldowns;

-- 4. usage_logs table
CREATE TABLE usage_logs_new (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO usage_logs_new
SELECT id, user_id, action, metadata,
       COALESCE(strftime('%s', created_at), strftime('%s', 'now'))
FROM usage_logs;

DROP TABLE usage_logs;
ALTER TABLE usage_logs_new RENAME TO usage_logs;

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action ON usage_logs(action);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_created ON usage_logs(action, created_at);

-- 5. system_configs table
CREATE TABLE system_configs_new (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO system_configs_new
SELECT key, value,
       COALESCE(strftime('%s', updated_at), strftime('%s', 'now'))
FROM system_configs;

DROP TABLE system_configs;
ALTER TABLE system_configs_new RENAME TO system_configs;

-- 6. audit_logs table
CREATE TABLE audit_logs_new (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO audit_logs_new
SELECT id, admin_id, action, target_type, target_id, details,
       COALESCE(strftime('%s', created_at), strftime('%s', 'now'))
FROM audit_logs;

DROP TABLE audit_logs;
ALTER TABLE audit_logs_new RENAME TO audit_logs;

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);
