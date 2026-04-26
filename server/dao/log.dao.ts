/**
 * Log DAO - 使用日志与统计
 */

export interface UsageLog {
  id: string
  user_id: string | null
  action: string
  metadata: string | null
  created_at: number
}

export async function createUsageLog(
  db: D1Database,
  log: Omit<UsageLog, 'created_at'>
): Promise<void> {
  const stmt = db.prepare(
    'INSERT INTO usage_logs (id, user_id, action, metadata, created_at) VALUES (?, ?, ?, ?, ?)'
  )
  await stmt.bind(log.id, log.user_id ?? null, log.action, log.metadata ?? null, Math.floor(Date.now() / 1000)).run()
}

export async function getUsageLogs(
  db: D1Database,
  options: { limit?: number; offset?: number; action?: string; startDate?: number; endDate?: number } = {}
): Promise<{ logs: (UsageLog & { username: string | null })[]; total: number }> {
  const conditions: string[] = []
  const values: (string | number)[] = []

  if (options.action) {
    conditions.push('action = ?')
    values.push(options.action)
  }
  if (options.startDate) {
    conditions.push('created_at >= ?')
    values.push(options.startDate)
  }
  if (options.endDate) {
    conditions.push('created_at <= ?')
    values.push(options.endDate)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const limit = options.limit ?? 20
  const offset = options.offset ?? 0

  const [countResult, logsResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) as total FROM usage_logs ${whereClause}`).bind(...values),
    db.prepare(
      `SELECT l.id, l.user_id, u.username, l.action, l.metadata, l.created_at FROM usage_logs l LEFT JOIN users u ON l.user_id = u.id ${whereClause} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
    ).bind(...values, limit, offset),
  ])

  return {
    logs: (logsResult as D1Result<UsageLog & { username: string | null }>).results ?? [],
    total: (countResult as D1Result<{ total: number }>).results?.[0]?.total ?? 0,
  }
}

export async function getUsageStats(
  db: D1Database,
  startDate?: number,
  endDate?: number
): Promise<{ action: string; count: number }[]> {
  const conditions: string[] = []
  const values: (string | number)[] = []

  if (startDate) {
    conditions.push('created_at >= ?')
    values.push(startDate)
  }
  if (endDate) {
    conditions.push('created_at <= ?')
    values.push(endDate)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt = db.prepare(`SELECT action, COUNT(*) as count FROM usage_logs ${whereClause} GROUP BY action ORDER BY count DESC`)
  const result = await stmt.bind(...values).all<{ action: string; count: number }>()
  return result.results ?? []
}

export async function getUserDailyUsageCount(
  db: D1Database,
  userId: string,
  action?: string
): Promise<number> {
  let sql = "SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND date(created_at, 'unixepoch') = date('now')"
  const params: (string | number)[] = [userId]
  if (action) {
    sql += ' AND action = ?'
    params.push(action)
  }
  const stmt = db.prepare(sql)
  const result = await stmt.bind(...params).first<{ count: number }>()
  return result?.count ?? 0
}

export async function getStats(db: D1Database): Promise<{
  totalUsers: number
  todayNewUsers: number
  totalLogs: number
  todayLogs: number
}> {
  const totalUsersStmt = db.prepare('SELECT COUNT(*) as count FROM users')
  const totalUsersResult = await totalUsersStmt.first<{ count: number }>()

  const todayNewUsersStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at, 'unixepoch') = date('now')")
  const todayNewUsersResult = await todayNewUsersStmt.first<{ count: number }>()

  const totalLogsStmt = db.prepare('SELECT COUNT(*) as count FROM usage_logs')
  const totalLogsResult = await totalLogsStmt.first<{ count: number }>()

  const todayLogsStmt = db.prepare("SELECT COUNT(*) as count FROM usage_logs WHERE date(created_at, 'unixepoch') = date('now')")
  const todayLogsResult = await todayLogsStmt.first<{ count: number }>()

  return {
    totalUsers: totalUsersResult?.count ?? 0,
    todayNewUsers: todayNewUsersResult?.count ?? 0,
    totalLogs: totalLogsResult?.count ?? 0,
    todayLogs: todayLogsResult?.count ?? 0,
  }
}
