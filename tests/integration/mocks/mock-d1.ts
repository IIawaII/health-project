import '../../../worker-configuration.d.ts';
export class MockD1 implements D1Database {
  private tables = new Map<string, Map<string, Record<string, unknown>>>()

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this, sql)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  batch(statements: MockD1PreparedStatement[]): Promise<any> {
    return Promise.all(statements.map((s) => s.execute()))
  }

  exec(): Promise<{ count: number; duration: number }> {
    return Promise.resolve({ count: 0, duration: 0 })
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSession(_session: unknown | null): any {
    return this
  }

  getTable(name: string): Map<string, Record<string, unknown>> {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Map())
    }
    return this.tables.get(name)!
  }

  clear(): void {
    this.tables.clear()
  }
}

export class MockD1PreparedStatement implements D1PreparedStatement {
  private db: MockD1
  private sql: string
  private bindings: unknown[] = []

  constructor(db: MockD1, sql: string) {
    this.db = db
    this.sql = sql
  }

  bind(...values: unknown[]): MockD1PreparedStatement {
    this.bindings = values
    return this
  }

  async first<T = unknown>(): Promise<T | null> {
    const result = await this.execute()
    return (result.results?.[0] as T) || null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async run(): Promise<any> {
    return this.execute()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async all(): Promise<any> {
    return this.execute()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async raw(): Promise<any> {
    const result = await this.execute() as { results: unknown[] }
    return result.results
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(): Promise<any> {
    const sql = this.sql.trim()
    const bindings = this.bindings

    // DELETE
    if (sql.startsWith('DELETE')) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)
      let changes = 0

      if (sql.includes('WHERE purpose = ? AND email = ? AND code = ?')) {
        const [purpose, email, code, now] = bindings as string[]
        const key = `${purpose}:${email}`
        const record = table.get(key)
        if (record && record.code === code) {
          if ((record.expires_at as string) > now) {
            table.delete(key)
            changes = 1
          }
        }
      } else if (sql.includes('WHERE purpose = ? AND email = ?')) {
        const [purpose, email] = bindings as string[]
        const key = `${purpose}:${email}`
        if (table.has(key)) {
          table.delete(key)
          changes = 1
        }
      } else if (sql.includes('WHERE id = ?')) {
        const [id] = bindings as string[]
        if (table.has(id)) {
          table.delete(id)
          changes = 1
        }
      }

      return { success: true, results: [], meta: { changes } }
    }

    // SELECT COUNT
    if (sql.includes('COUNT(*)')) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)
      return { success: true, results: [{ total: table.size }], meta: { changes: 0 } }
    }

    // SELECT from users with username/email LIKE (OR 组合)
    if (sql.includes('username LIKE ?') || sql.includes('email LIKE ?')) {
      const table = this.db.getTable('users')
      const results: Record<string, unknown>[] = []

      for (const [, record] of table) {
        const usernameMatch = sql.includes('username LIKE ?') &&
          (record.username as string).toLowerCase().includes((bindings[0] as string).replace(/%/g, '').toLowerCase())
        const emailMatch = sql.includes('email LIKE ?') &&
          (record.email as string).toLowerCase().includes((bindings[1] as string).replace(/%/g, '').toLowerCase())

        if (usernameMatch || emailMatch) {
          results.push(record)
        }
      }

      const limitMatch = sql.match(/LIMIT\s+\?/i)
      const offsetMatch = sql.match(/OFFSET\s+\?/i)
      let limit = results.length
      let offset = 0
      if (limitMatch && offsetMatch) {
        limit = bindings[2] as number
        offset = bindings[3] as number
      } else if (limitMatch) {
        limit = bindings[2] as number
      }

      return { success: true, results: results.slice(offset, offset + limit), meta: { changes: 0 } }
    }

    // SELECT users by username (case-insensitive, optional exclude id)
    if (sql.startsWith('SELECT') && sql.includes('FROM users') && sql.includes('username = ?')) {
      const usersTable = this.db.getTable('users')
      const [username] = bindings as string[]
      for (const [, record] of usersTable) {
        if ((record.username as string).toLowerCase() === (username as string).toLowerCase()) {
          if (sql.includes('AND id != ?')) {
            const [, excludeId] = bindings as string[]
            if (record.id === excludeId) continue
          }
          return { success: true, results: [record], meta: { changes: 0 } }
        }
      }
      return { success: true, results: [], meta: { changes: 0 } }
    }

    // SELECT users by email (case-insensitive, optional exclude id)
    if (sql.startsWith('SELECT') && sql.includes('FROM users') && sql.includes('email = ?')) {
      const usersTable = this.db.getTable('users')
      const [email] = bindings as string[]
      for (const [, record] of usersTable) {
        if ((record.email as string).toLowerCase() === (email as string).toLowerCase()) {
          if (sql.includes('AND id != ?')) {
            const [, excludeId] = bindings as string[]
            if (record.id === excludeId) continue
          }
          return { success: true, results: [record], meta: { changes: 0 } }
        }
      }
      return { success: true, results: [], meta: { changes: 0 } }
    }

    // SELECT users by id
    if (sql.startsWith('SELECT') && sql.includes('FROM users') && sql.includes('WHERE id = ?')) {
      const usersTable = this.db.getTable('users')
      const [id] = bindings as string[]
      const record = usersTable.get(id)
      if (record) {
        return { success: true, results: [record], meta: { changes: 0 } }
      }
      return { success: true, results: [], meta: { changes: 0 } }
    }

    // SELECT from users (list) — must be after specific WHERE clauses
    if (sql.startsWith('SELECT') && sql.includes('FROM users') && !sql.includes('WHERE id = ?')) {
      const table = this.db.getTable('users')
      let results = Array.from(table.values())

      const limitMatch = sql.match(/LIMIT\s+\?/i)
      const offsetMatch = sql.match(/OFFSET\s+\?/i)
      if (limitMatch && offsetMatch) {
        const limit = bindings[bindings.length - 2] as number
        const offset = bindings[bindings.length - 1] as number
        results = results.slice(offset, offset + limit)
      } else if (limitMatch) {
        const limit = bindings[bindings.length - 1] as number
        results = results.slice(0, limit)
      }

      return { success: true, results, meta: { changes: 0 } }
    }

    // SELECT verification_codes / verification_code_cooldowns by purpose+email
    if (sql.startsWith('SELECT') && (sql.includes('verification_codes') || sql.includes('verification_code_cooldowns'))) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)
      const [purpose, email] = bindings as string[]
      const key = `${purpose}:${email}`
      const record = table.get(key)
      if (record) {
        return { success: true, results: [record], meta: { changes: 0 } }
      }
      return { success: true, results: [], meta: { changes: 0 } }
    }

    // SELECT from usage_logs / audit_logs / system_configs
    if (sql.startsWith('SELECT') && (sql.includes('usage_logs') || sql.includes('audit_logs') || sql.includes('system_configs'))) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)
      let results = Array.from(table.values())

      const limitMatch = sql.match(/LIMIT\s+\?/i)
      const offsetMatch = sql.match(/OFFSET\s+\?/i)
      if (limitMatch && offsetMatch) {
        const limit = bindings[bindings.length - 2] as number
        const offset = bindings[bindings.length - 1] as number
        results = results.slice(offset, offset + limit)
      } else if (limitMatch) {
        const limit = bindings[bindings.length - 1] as number
        results = results.slice(0, limit)
      }

      return { success: true, results, meta: { changes: 0 } }
    }

    // SELECT with DATE(created_at)
    if (sql.includes("DATE(created_at)")) {
      const table = this.db.getTable('users')
      const dateGroups = new Map<string, number>()

      for (const [, record] of table) {
        const date = new Date(record.created_at as string).toISOString().split('T')[0]
        dateGroups.set(date, (dateGroups.get(date) || 0) + 1)
      }

      const results = Array.from(dateGroups.entries()).map(([date, count]) => ({ date, count }))
      return { success: true, results, meta: { changes: 0 } }
    }

    // SELECT with action GROUP BY
    if (sql.includes('GROUP BY action')) {
      const table = this.db.getTable('usage_logs')
      const actionGroups = new Map<string, number>()

      for (const [, record] of table) {
        const action = record.action as string
        actionGroups.set(action, (actionGroups.get(action) || 0) + 1)
      }

      const results = Array.from(actionGroups.entries()).map(([action, count]) => ({ action, count }))
      return { success: true, results, meta: { changes: 0 } }
    }

    // SELECT with DATE = 'now'
    if (sql.includes("= DATE('now')") || sql.includes("= DATE('now'")) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)
      const today = new Date().toISOString().split('T')[0]
      let count = 0

      for (const [, record] of table) {
        const createdDate = new Date(record.created_at as string).toISOString().split('T')[0]
        if (createdDate === today) {
          count++
        }
      }

      return { success: true, results: [{ count }], meta: { changes: 0 } }
    }

    // INSERT / ON CONFLICT (upsert)
    if (sql.startsWith('INSERT') || sql.includes('ON CONFLICT')) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)

      if (tableName === 'users') {
        const [id, username, email, password_hash, avatar, created_at, updated_at] = bindings as string[]
        table.set(id as string, { id, username, email, password_hash, avatar, created_at, updated_at })
      }

      if (tableName === 'verification_codes') {
        const [purpose, email, code, createdAt, expiresAt] = bindings as string[]
        const key = `${purpose}:${email}`
        table.set(key, { purpose, email, code, created_at: createdAt, expires_at: expiresAt })
      }

      if (tableName === 'verification_code_cooldowns') {
        const [purpose, email, sentAt] = bindings as string[]
        const key = `${purpose}:${email}`
        table.set(key, { purpose, email, sent_at: sentAt })
      }

      if (tableName === 'usage_logs') {
        const [id, user_id, action, metadata, created_at] = bindings as string[]
        table.set(id, { id, user_id, action, metadata, created_at })
      } else if (tableName === 'audit_logs') {
        const [id, admin_id, action, target_type, target_id, details, created_at] = bindings as [string, string | null, string | null, string | null, string | null, string | null, string | null]
        table.set(id, { id, admin_id, action, target_type, target_id, details, created_at })
      } else if (tableName === 'system_configs') {
        const [key, value, updated_at] = bindings as string[]
        table.set(key, { key, value, updated_at })
      }

      return { success: true, results: [], meta: { changes: 1 } }
    }

    // UPDATE users
    if (sql.startsWith('UPDATE users') && sql.includes('WHERE id = ?')) {
      const table = this.db.getTable('users')
      const id = bindings[bindings.length - 1] as string
      const record = table.get(id)
      if (record) {
        const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i)
        if (setMatch) {
          const setParts = setMatch[1].split(',').map((f) => f.trim())
          const valueBindings = bindings.slice(0, setParts.length)
          setParts.forEach((field, idx) => {
            const fieldName = field.split('=')[0].trim()
            record[fieldName] = valueBindings[idx]
          })
        }
        return { success: true, results: [], meta: { changes: 1 } }
      }
      return { success: true, results: [], meta: { changes: 0 } }
    }

    return { success: true, results: [], meta: { changes: 0 } }
  }

  private extractTableName(sql: string): string {
    const fromMatch = sql.match(/FROM\s+(\w+)/i)
    const intoMatch = sql.match(/INTO\s+(\w+)/i)
    const updateMatch = sql.match(/UPDATE\s+(\w+)/i)
    return fromMatch?.[1] || intoMatch?.[1] || updateMatch?.[1] || 'unknown'
  }
}
