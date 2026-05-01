import { eq, desc, and, lte } from 'drizzle-orm'
import { getDb, backupTasks, backupRecords, type DbClient } from '../db'
import { getLogger } from '../utils/logger'

const logger = getLogger('BackupDAO')

const EXPORT_BATCH_SIZE = 500
const EXPORT_MAX_ROWS_PER_TABLE = 100_000
const EXPORT_TIMEOUT_MS = 25_000

export const ALLOWED_EXPORT_TABLES = new Set([
  'users',
  'verification_codes',
  'verification_code_cooldowns',
  'usage_logs',
  'system_configs',
  'audit_logs',
  'request_metrics',
  'user_ai_configs',
  'backup_tasks',
  'backup_records',
])

const VALID_TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/

const ALLOWED_COLUMNS: Record<string, Set<string>> = {
  users: new Set(['id', 'username', 'email', 'password_hash', 'avatar', 'accountname', 'role', 'data_key', 'created_at', 'updated_at']),
  verification_codes: new Set(['purpose', 'email', 'code', 'attempts', 'created_at', 'expires_at']),
  verification_code_cooldowns: new Set(['purpose', 'email', 'sent_at']),
  usage_logs: new Set(['id', 'user_id', 'action', 'metadata', 'created_at']),
  system_configs: new Set(['key', 'value', 'updated_at']),
  audit_logs: new Set(['id', 'admin_id', 'action', 'target_type', 'target_id', 'details', 'created_at']),
  request_metrics: new Set(['id', 'path', 'method', 'status_code', 'latency_ms', 'user_id', 'ip', 'created_at']),
  user_ai_configs: new Set(['user_id', 'encrypted_config', 'config_iv', 'updated_at']),
  backup_tasks: new Set(['id', 'name', 'scope', 'frequency', 'retention_days', 'is_paused', 'last_run_at', 'next_run_at', 'created_at', 'updated_at']),
  backup_records: new Set(['id', 'task_id', 'status', 'scope', 'size_bytes', 'started_at', 'completed_at', 'error_message', 'created_at']),
}

function db(d1: D1Database): DbClient {
  return getDb(d1)
}

export const SENSITIVE_TABLE_COLUMNS: Record<string, string[]> = {
  users: ['password_hash', 'data_key'],
  user_ai_configs: ['encrypted_config', 'config_iv'],
}

async function getTableColumns(d1: D1Database, table: string): Promise<string[]> {
  const result = await d1.prepare(`PRAGMA table_info(${table})`).all()
  const columns = (result.results as Array<{ name: string }>).map((r) => r.name)
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`PRAGMA table_info returned invalid result for table "${table}"`)
  }
  return columns
}

function assertAllowedTable(table: string): void {
  if (!ALLOWED_EXPORT_TABLES.has(table)) {
    throw new Error(`Table "${table}" is not allowed for export/query`)
  }
  if (!VALID_TABLE_NAME_RE.test(table)) {
    throw new Error(`Invalid table name format: "${table}"`)
  }
}

export function filterAllowedColumns(tableName: string, columns: string[]): string[] {
  const allowed = ALLOWED_COLUMNS[tableName]
  if (!allowed) return []
  return columns.filter((c) => allowed.has(c) && VALID_TABLE_NAME_RE.test(c))
}

export async function exportTableBatched(
  d1: D1Database,
  table: string,
  batchSize: number = EXPORT_BATCH_SIZE,
  maxRows: number = EXPORT_MAX_ROWS_PER_TABLE
): Promise<unknown[]> {
  assertAllowedTable(table)

  const startTime = Date.now()
  const sensitiveColumns = SENSITIVE_TABLE_COLUMNS[table]

  const allRows: unknown[] = []
  let offset = 0

  while (offset < maxRows) {
    if (Date.now() - startTime > EXPORT_TIMEOUT_MS) {
      logger.warn('Table export timed out, returning partial data', {
        table,
        exportedRows: allRows.length,
        elapsedMs: Date.now() - startTime,
      })
      break
    }

    let result: D1Result<unknown>
    if (sensitiveColumns) {
      const allColumns = await getTableColumns(d1, table)
      const safeColumns = allColumns.filter((c) => !sensitiveColumns.includes(c))
      const sql = `SELECT ${safeColumns.map((c) => `\`${c}\``).join(', ')} FROM ${table} LIMIT ? OFFSET ?`
      result = await d1.prepare(sql).bind(batchSize, offset).all()
    } else {
      result = await d1
        .prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`)
        .bind(batchSize, offset)
        .all()
    }

    const rows = result.results
    if (!rows || rows.length === 0) break

    allRows.push(...rows)
    if (rows.length < batchSize) break
    offset += batchSize
  }

  if (allRows.length >= maxRows) {
    logger.warn('Table export hit row limit, data may be truncated', {
      table,
      exportedRows: allRows.length,
      maxRows,
    })
  }

  return allRows
}

export interface BackupTask {
  id: string
  name: string
  scope: string
  frequency: string
  retention_days: number
  is_paused: number
  last_run_at: number | null
  next_run_at: number | null
  created_at: number
  updated_at: number
}

export interface BackupRecord {
  id: string
  task_id: string
  status: string
  scope: string
  size_bytes: number | null
  started_at: number | null
  completed_at: number | null
  error_message: string | null
  created_at: number
}

export interface CreateBackupTaskInput {
  id: string
  name: string
  scope: string
  frequency: string
  retention_days: number
  created_at: number
  updated_at: number
  next_run_at?: number | null
}

export async function createBackupTask(d1: D1Database, input: CreateBackupTaskInput): Promise<void> {
  await db(d1).insert(backupTasks).values(input).run()
}

export async function getBackupTaskById(d1: D1Database, id: string): Promise<BackupTask | undefined> {
  try {
    const result = await db(d1).select().from(backupTasks).where(eq(backupTasks.id, id)).get()
    return result as BackupTask | undefined
  } catch (error) {
    logger.error('Failed to query backup_task by id', { error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}

export async function getBackupTaskList(d1: D1Database, limit = 100): Promise<BackupTask[]> {
  try {
    const result = await db(d1).select().from(backupTasks).orderBy(desc(backupTasks.created_at)).limit(limit).all()
    return result as BackupTask[]
  } catch (error) {
    logger.error('Failed to query backup_tasks', { error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

export async function updateBackupTask(d1: D1Database, id: string, updates: Partial<Omit<BackupTask, 'id' | 'created_at'>>): Promise<void> {
  await db(d1).update(backupTasks).set(updates).where(eq(backupTasks.id, id)).run()
}

export async function deleteBackupTask(d1: D1Database, id: string): Promise<void> {
  await db(d1).delete(backupRecords).where(eq(backupRecords.task_id, id)).run()
  await db(d1).delete(backupTasks).where(eq(backupTasks.id, id)).run()
}

export async function getDueBackupTasks(d1: D1Database, now: number): Promise<BackupTask[]> {
  const result = await db(d1)
    .select()
    .from(backupTasks)
    .where(
      and(
        eq(backupTasks.is_paused, 0),
        lte(backupTasks.next_run_at, now)
      )
    )
    .limit(50)
    .all()
  return result as BackupTask[]
}

export async function createBackupRecord(d1: D1Database, input: BackupRecord): Promise<void> {
  await db(d1).insert(backupRecords).values({
    ...input,
    size_bytes: input.size_bytes ?? null,
  }).run()
}

export async function updateBackupRecord(d1: D1Database, id: string, updates: Partial<Omit<BackupRecord, 'id' | 'task_id' | 'created_at'>>): Promise<void> {
  await db(d1).update(backupRecords).set(updates).where(eq(backupRecords.id, id)).run()
}

export async function getBackupRecordsByTaskId(d1: D1Database, taskId: string, limit = 20): Promise<BackupRecord[]> {
  try {
    const result = await db(d1)
      .select()
      .from(backupRecords)
      .where(eq(backupRecords.task_id, taskId))
      .orderBy(desc(backupRecords.created_at))
      .limit(limit)
      .all()
    return result as BackupRecord[]
  } catch (error) {
    logger.error('Failed to query backup_records by taskId', { error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

export async function getBackupRecordById(d1: D1Database, id: string): Promise<BackupRecord | undefined> {
  try {
    const result = await db(d1).select().from(backupRecords).where(eq(backupRecords.id, id)).get()
    return result as BackupRecord | undefined
  } catch (error) {
    logger.error('Failed to query backup_record by id', { error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}

export async function deleteExpiredBackupRecords(d1: D1Database, taskId: string, retentionDays: number): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400
  const result = await db(d1)
    .delete(backupRecords)
    .where(
      and(
        eq(backupRecords.task_id, taskId),
        lte(backupRecords.created_at, cutoff)
      )
    )
    .run()
  return (result as { rowsAffected?: number }).rowsAffected ?? 0
}

export async function getAllBackupRecords(d1: D1Database, limit = 50): Promise<BackupRecord[]> {
  try {
    const result = await db(d1)
      .select()
      .from(backupRecords)
      .orderBy(desc(backupRecords.created_at))
      .limit(limit)
      .all()
    return result as BackupRecord[]
  } catch (error) {
    logger.error('Failed to query backup_records', { error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

export function calculateNextRunAt(frequency: string, from?: number): number | null {
  if (frequency === 'manual') return null
  const base = from ?? Math.floor(Date.now() / 1000)
  switch (frequency) {
    case 'daily': return base + 86400
    case 'weekly': return base + 7 * 86400
    case 'monthly': return base + 30 * 86400
    default: return null
  }
}

export async function executeBackupForTask(d1: D1Database, taskId: string): Promise<{ recordId: string; sizeBytes: number }> {
  const task = await getBackupTaskById(d1, taskId)
  if (!task) throw new Error(`Backup task ${taskId} not found`)

  const recordId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const scope = JSON.parse(task.scope) as string[]

  await createBackupRecord(d1, {
    id: recordId,
    task_id: taskId,
    status: 'running',
    scope: task.scope,
    size_bytes: null,
    started_at: now,
    completed_at: null,
    error_message: null,
    created_at: now,
  })

  try {
    const backupData: Record<string, unknown> = {
      _meta: {
        taskId,
        taskName: task.name,
        exportedAt: new Date().toISOString(),
        scope,
      },
    }

    if (scope.includes('database')) {
      const tables = ['users', 'verification_codes', 'verification_code_cooldowns', 'usage_logs', 'system_configs', 'audit_logs', 'request_metrics', 'user_ai_configs']
      for (const table of tables) {
        try {
          backupData[`table_${table}`] = await exportTableBatched(d1, table)
        } catch (err) {
          logger.debug('Failed to export table during backup', { table, error: err instanceof Error ? err.message : String(err) })
          backupData[`table_${table}`] = []
        }
      }
    }

    if (scope.includes('config')) {
      try {
        backupData.configs = await exportTableBatched(d1, 'system_configs')
      } catch (err) {
        logger.debug('Failed to export configs during backup', { error: err instanceof Error ? err.message : String(err) })
        backupData.configs = []
      }
    }

    const jsonStr = JSON.stringify(backupData)
    const sizeBytes = new TextEncoder().encode(jsonStr).length

    await d1.prepare(
      'UPDATE backup_records SET status = ?, size_bytes = ?, completed_at = ? WHERE id = ?'
    ).bind('completed', sizeBytes, Math.floor(Date.now() / 1000), recordId).run()

    const nextRun = calculateNextRunAt(task.frequency, now)
    await updateBackupTask(d1, taskId, {
      last_run_at: now,
      next_run_at: nextRun,
      updated_at: now,
    })

    await deleteExpiredBackupRecords(d1, taskId, task.retention_days)

    logger.info('Backup completed', { taskId, recordId, sizeBytes })
    return { recordId, sizeBytes }
  } catch (err) {
    await d1.prepare(
      'UPDATE backup_records SET status = ?, error_message = ?, completed_at = ? WHERE id = ?'
    ).bind('failed', err instanceof Error ? err.message : String(err), Math.floor(Date.now() / 1000), recordId).run()

    logger.error('Backup failed', { taskId, recordId, error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
