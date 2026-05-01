CREATE TABLE IF NOT EXISTS backup_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '["database"]',
  frequency TEXT NOT NULL DEFAULT 'manual',
  retention_days INTEGER NOT NULL DEFAULT 30,
  is_paused INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_tasks_frequency ON backup_tasks(frequency);
CREATE INDEX IF NOT EXISTS idx_backup_tasks_is_paused ON backup_tasks(is_paused);
CREATE INDEX IF NOT EXISTS idx_backup_tasks_next_run ON backup_tasks(next_run_at);

CREATE TABLE IF NOT EXISTS backup_records (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scope TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES backup_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_backup_records_task_id ON backup_records(task_id);
CREATE INDEX IF NOT EXISTS idx_backup_records_status ON backup_records(status);
CREATE INDEX IF NOT EXISTS idx_backup_records_created_at ON backup_records(created_at);
