-- Admin role, usage logs, system configs, and audit logs migration

ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action ON usage_logs(action);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_created ON usage_logs(action, created_at);

CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO system_configs (key, value, updated_at) VALUES
  ('max_requests_per_day', '50', datetime('now')),
  ('maintenance_mode', 'false', datetime('now')),
  ('enable_registration', 'true', datetime('now')),
  ('max_request_body_size', '10485760', datetime('now')),
  ('smtp_timeout_ms', '15000', datetime('now')),
  ('max_login_failures', '5', datetime('now')),
  ('account_lockout_seconds', '900', datetime('now')),
  ('metrics_sample_rate', '0.1', datetime('now'))
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);

UPDATE users SET role = 'user' WHERE role IS NULL;
