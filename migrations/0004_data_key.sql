-- Add data_key column for per-user frontend encryption
ALTER TABLE users ADD COLUMN data_key TEXT;

-- Create index for data_key lookups
CREATE INDEX IF NOT EXISTS idx_users_data_key ON users(data_key);
