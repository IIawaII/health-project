import '../../../worker-configuration.d.ts'

/**
 * Drizzle ORM 兼容的 Mock D1 数据库
 *
 * Drizzle ORM 生成的 SQL 特征：
 * - 小写关键字: select, insert, update, delete
 * - 双引号标识符: "users"."id"
 * - 表限定列名: where "users"."id" = ?
 * - SELECT 使用 .raw() 方法
 * - INSERT 包含所有 schema 定义的列（9个绑定参数）
 */

export class MockD1 implements D1Database {
  private tables = new Map<string, Map<string, Record<string, unknown>>>()
  _lock: Promise<void> = Promise.resolve()

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

/** 规范化 SQL：去除双引号 */
function normalizeSql(sql: string): string {
  return sql.replace(/"/g, '')
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
    // Drizzle ORM 期望 raw() 返回数组的数组（每行是一个值数组）
    // 需要根据 SELECT 列顺序将对象转换为数组
    const rawSql = normalizeSql(this.sql.trim())
    const columns = this.extractSelectColumns(rawSql)
    return (result.results as Record<string, unknown>[]).map((row) => {
      if (columns.length === 0) {
        // 聚合函数查询（如 COUNT(*)），返回对象的值数组
        return Object.values(row)
      }
      return columns.map((col) => {
        // 字面量数字（如 SELECT 1）
        if (/^\d+$/.test(col)) return Number(col)
        // 字符串字面量
        if (col.startsWith("'") && col.endsWith("'")) return col.slice(1, -1)
        // 列名查找
        return row[col] ?? null
      })
    })
  }

  /** 从 SELECT 语句中提取列名/表达式 */
  private extractSelectColumns(sql: string): string[] {
    const selectMatch = sql.match(/select\s+(.+?)\s+from\s+/is)
    if (!selectMatch) return []
    const columnsStr = selectMatch[1]
    // 分割列名（处理逗号分隔，但要注意函数调用中的逗号）
    const parts = this.splitSelectColumns(columnsStr)
    return parts
      .map((c) => c.trim())
      .filter((c) => !c.toLowerCase().startsWith('count(')) // 跳过聚合函数
      .map((c) => {
        // 处理 "table"."column" 格式 -> column
        const dotMatch = c.match(/\.(\w+)$/)
        if (dotMatch) return dotMatch[1]
        // 处理别名: "column" as "alias" -> alias
        const asMatch = c.match(/\s+as\s+(\w+)$/i)
        if (asMatch) return asMatch[1]
        return c
      })
  }

  /** 简单分割 SELECT 列（处理基本逗号分隔） */
  private splitSelectColumns(columnsStr: string): string[] {
    // 简单按逗号分割（对于基本查询足够）
    return columnsStr.split(',').map((c) => c.trim())
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(): Promise<any> {
    const prevLock = this.db._lock
    let resolveLock: () => void
    this.db._lock = new Promise<void>((resolve) => { resolveLock = resolve })
    await prevLock
    try {
      return await this._executeInner()
    } finally {
      resolveLock!()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _executeInner(): Promise<any> {
    const rawSql = this.sql.trim()
    const sql = normalizeSql(rawSql)
    const lowerSql = sql.toLowerCase()
    const bindings = this.bindings

    // DELETE
    if (lowerSql.startsWith('delete')) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)
      let changes = 0

      // 验证码删除: WHERE purpose = ? AND email = ? AND code = ? (可能带 expires_at > ?)
      if (lowerSql.includes('purpose = ?') && lowerSql.includes('email = ?') && lowerSql.includes('code = ?')) {
        const purpose = bindings[0] as string
        const email = bindings[1] as string
        const code = bindings[2] as string
        const key = `${purpose}:${email}`
        const record = table.get(key)
        if (record && record.code === code) {
          if (lowerSql.includes('expires_at > ?')) {
            const now = bindings[3] as number
            if ((record.expires_at as number) > now) {
              table.delete(key)
              changes = 1
            }
          } else {
            table.delete(key)
            changes = 1
          }
        }
      }
      // 验证码/冷却删除: WHERE purpose = ? AND email = ?
      else if (lowerSql.includes('purpose = ?') && lowerSql.includes('email = ?')) {
        const purpose = bindings[0] as string
        const email = bindings[1] as string
        const key = `${purpose}:${email}`
        if (table.has(key)) {
          table.delete(key)
          changes = 1
        }
      }
      // 按 ID 删除: WHERE id = ? (Drizzle: users.id = ?)
      else if (lowerSql.includes('id = ?')) {
        const id = bindings[bindings.length - 1] as string
        if (table.has(id)) {
          table.delete(id)
          changes = 1
        }
      }
      // 批量清理过期验证码: WHERE expires_at <= ?
      else if (lowerSql.includes('expires_at')) {
        for (const [key, record] of table) {
          if (typeof bindings[0] === 'string') {
            const expireTime = new Date(bindings[0]).getTime() / 1000
            if ((record.expires_at as number) <= expireTime) {
              table.delete(key)
              changes++
            }
          }
        }
      }

      return { success: true, results: [], meta: { changes } }
    }

    // SELECT (Drizzle 使用小写 select)
    if (lowerSql.startsWith('select')) {
      const tableName = this.extractTableName(sql)

      // SELECT COUNT(*)
      if (lowerSql.includes('count(*)')) {
        const table = this.db.getTable(tableName)
        let count = table.size

        // 处理 WHERE 条件过滤
        if (lowerSql.includes('where')) {
          count = 0
          for (const [, record] of table) {
            if (this.matchesWhereCondition(lowerSql, bindings, record)) {
              count++
            }
          }
        }
        return { success: true, results: [{ total: count, count }], meta: { changes: 0 } }
      }

      // SELECT with LIKE
      if (lowerSql.includes('like ?')) {
        const table = this.db.getTable(tableName)
        const results: Record<string, unknown>[] = []

        for (const [, record] of table) {
          let matches = false
          for (const binding of bindings) {
            if (typeof binding === 'string' && binding.includes('%')) {
              const pattern = binding.replace(/%/g, '').toLowerCase()
              if (
                (record.username && (record.username as string).toLowerCase().includes(pattern)) ||
                (record.email && (record.email as string).toLowerCase().includes(pattern))
              ) {
                matches = true
                break
              }
            }
          }
          if (matches) results.push(record)
        }

        // 提取 LIMIT/OFFSET（Drizzle 的 limit/offset 在最后两个绑定参数）
        let limit = results.length
        let offset = 0
        if (lowerSql.includes('limit ?') && lowerSql.includes('offset ?')) {
          limit = bindings[bindings.length - 2] as number
          offset = bindings[bindings.length - 1] as number
        } else if (lowerSql.includes('limit ?')) {
          limit = bindings[bindings.length - 1] as number
        }

        return { success: true, results: results.slice(offset, offset + limit), meta: { changes: 0 } }
      }

      // SELECT with username/email equality (case-insensitive, COLLATE NOCASE)
      if (tableName === 'users' && (lowerSql.includes('username = ?') || lowerSql.includes('email = ?'))) {
        const table = this.db.getTable('users')
        const targetValue = bindings[0] as string
        const isUsername = lowerSql.includes('username = ?')
        const excludeId = (lowerSql.includes('id != ?') || lowerSql.includes('id <> ?')) ? bindings[1] as string : null

        for (const [, record] of table) {
          const fieldValue = (isUsername ? record.username : record.email) as string
          if (fieldValue.toLowerCase() === targetValue.toLowerCase()) {
            if (excludeId && record.id === excludeId) continue
            return { success: true, results: [record], meta: { changes: 0 } }
          }
        }
        return { success: true, results: [], meta: { changes: 0 } }
      }

      // SELECT with purpose = ? AND email = ? (verification tables)
      if (lowerSql.includes('purpose = ?') && lowerSql.includes('email = ?')) {
        const table = this.db.getTable(tableName)
        const purpose = bindings[0] as string
        const email = bindings[1] as string
        const key = `${purpose}:${email}`
        const record = table.get(key)
        if (record) {
          return { success: true, results: [record], meta: { changes: 0 } }
        }
        return { success: true, results: [], meta: { changes: 0 } }
      }

      // SELECT by task_id (backup_records)
      if (lowerSql.includes('task_id = ?') && !lowerSql.includes('id != ?')) {
        const table = this.db.getTable(tableName)
        const taskId = bindings[0] as string
        const results = Array.from(table.values()).filter((r) => r.task_id === taskId)
        let limit = results.length
        let offset = 0
        if (lowerSql.includes('limit ?') && lowerSql.includes('offset ?')) {
          limit = bindings[bindings.length - 2] as number
          offset = bindings[bindings.length - 1] as number
        } else if (lowerSql.includes('limit ?')) {
          limit = bindings[bindings.length - 1] as number
        }
        return { success: true, results: results.slice(offset, offset + limit), meta: { changes: 0 } }
      }

      // SELECT by id (Drizzle: WHERE id = ? LIMIT ? — id 是第一个绑定参数)
      if (lowerSql.includes('id = ?')) {
        const table = this.db.getTable(tableName)
        const id = bindings[0] as string
        const record = table.get(id)
        if (record) {
          return { success: true, results: [record], meta: { changes: 0 } }
        }
        return { success: true, results: [], meta: { changes: 0 } }
      }

      // SELECT with DATE functions (daily stats)
      if (lowerSql.includes('date(')) {
        const table = this.db.getTable(tableName)
        const dateGroups = new Map<string, number>()

        for (const [, record] of table) {
          const ts = record.created_at as number
          const date = new Date(ts * 1000).toISOString().split('T')[0]
          dateGroups.set(date, (dateGroups.get(date) || 0) + 1)
        }

        const results = Array.from(dateGroups.entries()).map(([date, count]) => ({ date, count }))
        return { success: true, results, meta: { changes: 0 } }
      }

      // SELECT with GROUP BY
      if (lowerSql.includes('group by')) {
        const table = this.db.getTable(tableName)
        const actionGroups = new Map<string, number>()

        for (const [, record] of table) {
          const action = record.action as string
          actionGroups.set(action, (actionGroups.get(action) || 0) + 1)
        }

        const results = Array.from(actionGroups.entries()).map(([action, count]) => ({ action, count }))
        return { success: true, results, meta: { changes: 0 } }
      }

      // SELECT with LEFT JOIN (usage_logs + users)
      if (lowerSql.includes('left join')) {
        const table = this.db.getTable(tableName)
        let results = Array.from(table.values())

        // 添加 username 字段
        const usersTable = this.db.getTable('users')
        results = results.map((record) => {
          const user = usersTable.get(record.user_id as string)
          return { ...record, username: user?.username ?? null }
        })

        // LIMIT/OFFSET
        let limit = results.length
        let offset = 0
        if (lowerSql.includes('limit ?') && lowerSql.includes('offset ?')) {
          limit = bindings[bindings.length - 2] as number
          offset = bindings[bindings.length - 1] as number
        } else if (lowerSql.includes('limit ?')) {
          limit = bindings[bindings.length - 1] as number
        }

        return { success: true, results: results.slice(offset, offset + limit), meta: { changes: 0 } }
      }

      // Generic SELECT (list all)
      const table = this.db.getTable(tableName)
      const results = Array.from(table.values())

      // LIMIT/OFFSET
      let limit = results.length
      let offset = 0
      if (lowerSql.includes('limit ?') && lowerSql.includes('offset ?')) {
        limit = bindings[bindings.length - 2] as number
        offset = bindings[bindings.length - 1] as number
      } else if (lowerSql.includes('limit ?')) {
        limit = bindings[bindings.length - 1] as number
      }

      return { success: true, results: results.slice(offset, offset + limit), meta: { changes: 0 } }
    }

    // INSERT (Drizzle 使用小写 insert)
    if (lowerSql.startsWith('insert')) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)

      if (tableName === 'users') {
        const id = bindings[0] as string
        table.set(id, {
          id: bindings[0],
          username: bindings[1],
          email: bindings[2],
          password_hash: bindings[3],
          avatar: bindings[4],
          accountname: bindings[5],
          role: bindings[6] ?? 'user',
          data_key: bindings[7],
          created_at: bindings[8] as number,
          updated_at: bindings[9] as number,
        })
      } else if (tableName === 'verification_codes') {
        const key = `${bindings[0]}:${bindings[1]}`
        const hasOnConflict = lowerSql.includes('on conflict')
        if (hasOnConflict && table.has(key)) {
          const existing = table.get(key)!
          existing.code = bindings[2]
          existing.attempts = bindings[3] ?? 0
          existing.created_at = bindings[4]
          existing.expires_at = bindings[5]
        } else {
          table.set(key, {
            purpose: bindings[0],
            email: bindings[1],
            code: bindings[2],
            attempts: bindings[3] ?? 0,
            created_at: bindings[4],
            expires_at: bindings[5],
          })
        }
      } else if (tableName === 'verification_code_cooldowns') {
        const key = `${bindings[0]}:${bindings[1]}`
        table.set(key, {
          purpose: bindings[0],
          email: bindings[1],
          sent_at: bindings[2],
        })
      } else if (tableName === 'usage_logs') {
        const id = bindings[0] as string
        table.set(id, {
          id: bindings[0],
          user_id: bindings[1],
          action: bindings[2],
          metadata: bindings[3],
          created_at: bindings[4],
        })
      } else if (tableName === 'audit_logs') {
        const id = bindings[0] as string
        table.set(id, {
          id: bindings[0],
          admin_id: bindings[1],
          action: bindings[2],
          target_type: bindings[3],
          target_id: bindings[4],
          details: bindings[5],
          created_at: bindings[6],
        })
      } else if (tableName === 'system_configs') {
        const key = bindings[0] as string
        table.set(key, {
          key: bindings[0],
          value: bindings[1],
          updated_at: bindings[2],
        })
      } else if (tableName === 'backup_tasks') {
        const id = bindings[0] as string
        table.set(id, {
          id: bindings[0],
          name: bindings[1],
          scope: bindings[2],
          frequency: bindings[3],
          retention_days: bindings[4],
          is_paused: bindings[5],
          last_run_at: bindings[6],
          next_run_at: bindings[7],
          created_at: bindings[8],
          updated_at: bindings[9],
        })
      } else if (tableName === 'backup_records') {
        const id = bindings[0] as string
        table.set(id, {
          id: bindings[0],
          task_id: bindings[1],
          status: bindings[2],
          scope: bindings[3],
          size_bytes: bindings[4],
          started_at: bindings[5],
          completed_at: bindings[6],
          error_message: bindings[7],
          created_at: bindings[8],
        })
      } else {
        const id = bindings[0] as string
        if (id) {
          table.set(id, { id, ...Object.fromEntries(Object.entries(bindings).map(([i, v]) => [`col_${i}`, v])) })
        }
      }

      return { success: true, results: [], meta: { changes: 1 } }
    }

    // UPDATE (Drizzle 使用小写 update)
    if (lowerSql.startsWith('update')) {
      const tableName = this.extractTableName(sql)
      const table = this.db.getTable(tableName)

      // 提取 SET 子句中的列名
      const setMatch = sql.match(/set\s+(.+?)\s+where/i)
      if (setMatch) {
        const setParts = setMatch[1].split(',').map((f) => f.trim())
        // 最后一个是 WHERE id = ? 的 id 值
        const id = bindings[bindings.length - 1] as string
        const record = table.get(id)
        if (record) {
          setParts.forEach((field, idx) => {
            const fieldName = field.split('=')[0].trim()
            record[fieldName] = bindings[idx]
          })
          return { success: true, results: [], meta: { changes: 1 } }
        }
      }

      return { success: true, results: [], meta: { changes: 0 } }
    }

    return { success: true, results: [], meta: { changes: 0 } }
  }

  private extractTableName(sql: string): string {
    const fromMatch = sql.match(/from\s+(\w+)/i)
    const intoMatch = sql.match(/into\s+(\w+)/i)
    const updateMatch = sql.match(/update\s+(\w+)/i)
    return fromMatch?.[1] || intoMatch?.[1] || updateMatch?.[1] || 'unknown'
  }

  /** 检查记录是否匹配 WHERE 条件 */
  private matchesWhereCondition(lowerSql: string, bindings: unknown[], record: Record<string, unknown>): boolean {
    // date('now') 比较
    if (lowerSql.includes("date('now')")) {
      const today = new Date().toISOString().split('T')[0]
      const ts = record.created_at as number
      const recordDate = new Date(ts * 1000).toISOString().split('T')[0]
      return recordDate === today
    }
    // 默认全部匹配
    return true
  }
}
