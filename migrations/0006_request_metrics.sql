-- Migration: Create request_metrics table for performance monitoring
-- Records API request path, method, status code, latency, user info

CREATE TABLE IF NOT EXISTS request_metrics (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  user_id TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_metrics_path ON request_metrics(path);
CREATE INDEX IF NOT EXISTS idx_request_metrics_created_at ON request_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_request_metrics_status_code ON request_metrics(status_code);
