-- Add missing indexes for performance optimization

-- Audit logs: index by action for filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Audit logs: index by target_type for filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);

-- Usage logs: composite index for user daily usage queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at);

-- Usage logs: index by action for stats aggregation
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_created ON usage_logs(action, created_at);
