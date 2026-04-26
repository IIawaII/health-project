/**
 * Audit DAO - 审计日志
 */

export interface AuditLog {
  id: string
  admin_id: string
  action: string
  target_type: string | null
  target_id: string | null
  details: string | null
  created_at: number
}

export async function createAuditLog(
  db: D1Database,
  log: Omit<AuditLog, 'created_at'>
): Promise<void> {
  const stmt = db.prepare(
    'INSERT INTO audit_logs (id, admin_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  await stmt.bind(
    log.id, log.admin_id, log.action,
    log.target_type ?? null, log.target_id ?? null, log.details ?? null,
    Math.floor(Date.now() / 1000)
  ).run()
}

export async function getAuditLogs(
  db: D1Database,
  options: { limit?: number; offset?: number } = {}
): Promise<{ logs: AuditLog[]; total: number }> {
  const limit = options.limit ?? 20
  const offset = options.offset ?? 0

  const [countResult, logsResult] = await db.batch([
    db.prepare('SELECT COUNT(*) as total FROM audit_logs'),
    db.prepare(
      'SELECT id, admin_id, action, target_type, target_id, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset),
  ])

  return {
    logs: (logsResult as D1Result<AuditLog>).results ?? [],
    total: (countResult as D1Result<{ total: number }>).results?.[0]?.total ?? 0,
  }
}
