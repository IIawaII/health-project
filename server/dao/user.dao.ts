/**
 * User DAO - 用户数据访问层
 */

export interface DbUser {
  id: string
  username: string
  email: string
  password_hash: string
  avatar: string | null
  role: string
  data_key: string | null
  created_at: number
  updated_at: number
}

/** 不含敏感字段的用户信息 */
export type DbUserPublic = Omit<DbUser, 'password_hash' | 'data_key'>

export async function findUserByUsername(db: D1Database, username: string): Promise<DbUser | null> {
  const stmt = db.prepare('SELECT id, username, email, password_hash, avatar, role, data_key, created_at, updated_at FROM users WHERE username = ? COLLATE NOCASE')
  const result = await stmt.bind(username).first<DbUser>()
  return result ?? null
}

export async function findUserByEmail(db: D1Database, email: string): Promise<DbUser | null> {
  const stmt = db.prepare('SELECT id, username, email, password_hash, avatar, role, data_key, created_at, updated_at FROM users WHERE email = ? COLLATE NOCASE')
  const result = await stmt.bind(email).first<DbUser>()
  return result ?? null
}

export async function findUserById(db: D1Database, id: string): Promise<DbUser | null> {
  const stmt = db.prepare('SELECT id, username, email, password_hash, avatar, role, data_key, created_at, updated_at FROM users WHERE id = ?')
  const result = await stmt.bind(id).first<DbUser>()
  return result ?? null
}

export async function findUserByIdPublic(db: D1Database, id: string): Promise<DbUserPublic | null> {
  const stmt = db.prepare('SELECT id, username, email, avatar, role, created_at, updated_at FROM users WHERE id = ?')
  const result = await stmt.bind(id).first<DbUserPublic>()
  return result ?? null
}

export async function createUser(
  db: D1Database,
  user: Omit<DbUser, 'avatar'> & { avatar?: string | null }
): Promise<void> {
  const stmt = db.prepare(
    'INSERT INTO users (id, username, email, password_hash, avatar, data_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  await stmt.bind(
    user.id,
    user.username,
    user.email,
    user.password_hash,
    user.avatar ?? null,
    user.data_key ?? null,
    user.created_at,
    user.updated_at
  ).run()
}

export async function updateUserPassword(db: D1Database, id: string, passwordHash: string): Promise<void> {
  const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
  await stmt.bind(passwordHash, Math.floor(Date.now() / 1000), id).run()
}

const ALLOWED_UPDATE_COLUMNS = ['username', 'email', 'avatar'] as const

export async function updateUser(
  db: D1Database,
  id: string,
  updates: Partial<Pick<DbUser, typeof ALLOWED_UPDATE_COLUMNS[number]>>
): Promise<void> {
  // 校验不允许的字段，防止非法字段注入
  const invalidKeys = Object.keys(updates).filter(
    (k) => !(ALLOWED_UPDATE_COLUMNS as readonly string[]).includes(k)
  )
  if (invalidKeys.length > 0) {
    throw new Error(`Invalid update fields: ${invalidKeys.join(', ')}`)
  }

  const fieldMap: { column: string; value: string | null }[] = []

  if (updates.username !== undefined) {
    fieldMap.push({ column: 'username', value: updates.username })
  }
  if (updates.email !== undefined) {
    fieldMap.push({ column: 'email', value: updates.email })
  }
  if (updates.avatar !== undefined) {
    fieldMap.push({ column: 'avatar', value: updates.avatar })
  }

  if (fieldMap.length === 0) return

  const setClause = fieldMap.map((f) => `${f.column} = ?`).join(', ')
  const values = [...fieldMap.map((f) => f.value), Math.floor(Date.now() / 1000), id]

  const stmt = db.prepare(`UPDATE users SET ${setClause}, updated_at = ? WHERE id = ?`)
  await stmt.bind(...values).run()
}

export async function updateUserDataKey(db: D1Database, id: string, dataKey: string): Promise<void> {
  const stmt = db.prepare('UPDATE users SET data_key = ?, updated_at = ? WHERE id = ?')
  await stmt.bind(dataKey, Math.floor(Date.now() / 1000), id).run()
}

export async function updateUserRole(db: D1Database, id: string, role: string): Promise<void> {
  const stmt = db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
  await stmt.bind(role, Math.floor(Date.now() / 1000), id).run()
}

export async function deleteUserById(db: D1Database, id: string): Promise<void> {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?')
  await stmt.bind(id).run()
}

export async function usernameExists(db: D1Database, username: string, excludeId?: string): Promise<boolean> {
  if (excludeId) {
    const stmt = db.prepare('SELECT 1 as found FROM users WHERE username = ? COLLATE NOCASE AND id != ?')
    const result = await stmt.bind(username, excludeId).first<{ found: number }>()
    return !!result
  }
  const stmt = db.prepare('SELECT 1 as found FROM users WHERE username = ? COLLATE NOCASE')
  const result = await stmt.bind(username).first<{ found: number }>()
  return !!result
}

export async function emailExists(db: D1Database, email: string, excludeId?: string): Promise<boolean> {
  if (excludeId) {
    const stmt = db.prepare('SELECT 1 as found FROM users WHERE email = ? COLLATE NOCASE AND id != ?')
    const result = await stmt.bind(email, excludeId).first<{ found: number }>()
    return !!result
  }
  const stmt = db.prepare('SELECT 1 as found FROM users WHERE email = ? COLLATE NOCASE')
  const result = await stmt.bind(email).first<{ found: number }>()
  return !!result
}

export async function getUserList(
  db: D1Database,
  options: { limit?: number; offset?: number; search?: string } = {}
): Promise<{ users: DbUserPublic[]; total: number }> {
  const conditions: string[] = []
  const values: (string | number)[] = []

  if (options.search) {
    const searchTerm = options.search.slice(0, 100)
    const escaped = searchTerm.replace(/[%_]/g, '\\$&')
    conditions.push(`(username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')`)
    values.push(`%${escaped}%`, `%${escaped}%`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const limit = options.limit ?? 20
  const offset = options.offset ?? 0

  const [countResult, usersResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) as total FROM users ${whereClause}`).bind(...values),
    db.prepare(
      `SELECT id, username, email, avatar, role, created_at, updated_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...values, limit, offset),
  ])

  return {
    users: (usersResult as D1Result<DbUserPublic>).results ?? [],
    total: (countResult as D1Result<{ total: number }>).results?.[0]?.total ?? 0,
  }
}

export async function getDailyUserStats(db: D1Database, days: number = 30): Promise<{ date: string; count: number }[]> {
  const stmt = db.prepare(
    `SELECT date(created_at, 'unixepoch') as date, COUNT(*) as count FROM users WHERE created_at >= strftime('%s', 'now', ?) GROUP BY date(created_at, 'unixepoch') ORDER BY date ASC`
  )
  const result = await stmt.bind(`-${days} days`).all<{ date: string; count: number }>()
  return result.results ?? []
}
