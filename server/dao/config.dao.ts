/**
 * Config DAO - 系统配置
 */

export interface SystemConfig {
  key: string
  value: string
  updated_at: number
}

export async function getSystemConfig(db: D1Database, key: string): Promise<SystemConfig | null> {
  const stmt = db.prepare('SELECT key, value, updated_at FROM system_configs WHERE key = ?')
  const result = await stmt.bind(key).first<SystemConfig>()
  return result ?? null
}

export async function getAllSystemConfigs(db: D1Database): Promise<SystemConfig[]> {
  const stmt = db.prepare('SELECT key, value, updated_at FROM system_configs ORDER BY key ASC')
  const result = await stmt.all<SystemConfig>()
  return result.results ?? []
}

export async function setSystemConfig(db: D1Database, key: string, value: string): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
  await stmt.bind(key, value, Math.floor(Date.now() / 1000)).run()
}
