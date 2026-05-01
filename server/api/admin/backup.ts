import { z } from 'zod'
import { jsonResponse, errorResponse } from '../../utils/response'
import { withAdmin } from '../../middleware/admin'
import { createAuditLog } from '../../dao/audit.dao'
import {
  createBackupTask,
  getBackupTaskList,
  getBackupTaskById,
  updateBackupTask,
  deleteBackupTask,
  getBackupRecordsByTaskId,
  getBackupRecordById,
  getAllBackupRecords,
  executeBackupForTask,
  calculateNextRunAt,
  exportTableBatched,
  ALLOWED_EXPORT_TABLES,
} from '../../dao/backup.dao'
import { getLogger } from '../../utils/logger'
import { encryptBackupData, decryptBackupData } from '../../utils/crypto'
import { t } from '../../../shared/i18n/server'
import type { AdminContext } from '../../middleware/admin'

const logger = getLogger('AdminBackup')

const DOWNLOAD_TOKEN_TTL = 300
const RESTORE_CONFIRM_TTL = 300

const createTaskSchema = z.object({
  name: z.string().min(1, t('backup.validation.nameRequired', '备份名称不能为空')).max(30, t('backup.validation.nameTooLong', '备份名称不能超过30个字符')),
  scope: z.array(z.enum(['database', 'config'])).min(1, t('backup.validation.scopeRequired', '至少选择一项备份内容')),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'manual']),
  retention_days: z.number().int().min(1, t('backup.validation.retentionMin', '保留天数至少为1天')).max(365, t('backup.validation.retentionMax', '保留天数不能超过365天')),
})

const updateTaskSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  scope: z.array(z.enum(['database', 'config'])).min(1).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'manual']).optional(),
  retention_days: z.number().int().min(1).max(365).optional(),
  is_paused: z.boolean().optional(),
})

const restoreSchema = z.object({
  data: z.union([
    z.record(z.unknown()).refine((val) => val._meta !== undefined, t('backup.validation.invalidBackupFormat', '无效的备份数据格式：缺少 _meta 字段')),
    z.record(z.unknown()).refine((val) => val._encrypted === true, t('backup.validation.invalidEncryptedFormat', '无效的加密备份数据格式')),
  ]),
  scope: z.array(z.enum(['database', 'config'])).min(1, t('backup.validation.scopeRequired', '至少选择一项恢复内容')),
  confirm: z.literal(true, { message: t('backup.validation.confirmRequired', '请确认恢复操作') }),
  confirmToken: z.string().min(1, t('backup.validation.confirmTokenRequired', '缺少恢复确认令牌')),
  encryptionPassword: z.string().optional(),
})

const previewSchema = z.object({
  data: z.union([
    z.record(z.unknown()).refine((val) => val._meta !== undefined, t('backup.validation.invalidBackupFormat', '无效的备份数据格式：缺少 _meta 字段')),
    z.record(z.unknown()).refine((val) => val._encrypted === true, t('backup.validation.invalidEncryptedFormat', '无效的加密备份数据格式')),
  ]),
  encryptionPassword: z.string().optional(),
})

async function buildBackupJson(
  d1: D1Database,
  scope: string[],
  recordId: string,
  kvNamespaces?: { AUTH_TOKENS?: KVNamespace; VERIFICATION_CODES?: KVNamespace; SSRF_CACHE?: KVNamespace }
): Promise<string> {
  const backupData: Record<string, unknown> = {
    _meta: { recordId, exportedAt: new Date().toISOString(), scope, version: '2.0' },
  }

  if (scope.includes('database')) {
    const tables = [
      'users', 'verification_codes', 'verification_code_cooldowns',
      'usage_logs', 'system_configs', 'audit_logs', 'request_metrics',
      'user_ai_configs', 'backup_tasks', 'backup_records',
    ]
    for (const table of tables) {
      try {
        backupData[`table_${table}`] = await exportTableBatched(d1, table)
      } catch {
        backupData[`table_${table}`] = []
      }
    }
  }

  if (scope.includes('config')) {
    try {
      backupData.configs = await exportTableBatched(d1, 'system_configs')
    } catch {
      backupData.configs = []
    }
  }

  if (kvNamespaces) {
    const kvData: Record<string, unknown> = {}
    if (kvNamespaces.AUTH_TOKENS) {
      try { kvData.authTokens = await exportKvKeys(kvNamespaces.AUTH_TOKENS) } catch { kvData.authTokens = {} }
    }
    if (kvNamespaces.VERIFICATION_CODES) {
      try { kvData.verificationCodes = await exportKvKeys(kvNamespaces.VERIFICATION_CODES) } catch { kvData.verificationCodes = {} }
    }
    if (kvNamespaces.SSRF_CACHE) {
      try { kvData.ssrfCache = await exportKvKeys(kvNamespaces.SSRF_CACHE) } catch { kvData.ssrfCache = {} }
    }
    if (Object.keys(kvData).length > 0) {
      backupData.kv = kvData
    }
  }

  return JSON.stringify(backupData, null, 2)
}

const SENSITIVE_KV_PREFIXES = ['token:', 'refresh_token:', 'user_tokens:', 'user_refresh_tokens:', 'backup-download:']

function isSensitiveKvKey(key: string): boolean {
  return SENSITIVE_KV_PREFIXES.some((prefix) => key.startsWith(prefix))
}

async function exportKvKeys(kv: KVNamespace, excludeSensitive = true): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  let cursor: string | undefined
  do {
    const list = await kv.list({ cursor, limit: 1000 })
    for (const key of list.keys) {
      if (excludeSensitive && isSensitiveKvKey(key.name)) continue
      const value = await kv.get(key.name, 'text')
      if (value !== null) {
        result[key.name] = value
      }
    }
    cursor = list.list_complete ? undefined : list.cursor
  } while (cursor)
  return result
}

export const onRequestGet = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url)
    const type = url.searchParams.get('type')

    if (type === 'download') {
      const token = url.searchParams.get('token')
      if (!token) return errorResponse(t('backup.errors.missingDownloadToken', '缺少下载令牌'), 400)

      const stored = await context.env.AUTH_TOKENS.get(`backup-download:${token}`, 'text')
      if (!stored) return errorResponse(t('backup.errors.invalidToken', '下载令牌无效或已过期'), 401)

      await context.env.AUTH_TOKENS.delete(`backup-download:${token}`)

      const [recordId, encryptionPassword] = stored.split(':||:')
      const record = await getBackupRecordById(context.env.DB, recordId)
      if (!record) return errorResponse(t('backup.errors.recordNotFound', '备份记录不存在'), 404)

      const scope = JSON.parse(record.scope) as string[]
      const jsonStr = await buildBackupJson(context.env.DB, scope, recordId, {
        AUTH_TOKENS: context.env.AUTH_TOKENS,
        VERIFICATION_CODES: context.env.VERIFICATION_CODES,
        SSRF_CACHE: context.env.SSRF_CACHE,
      })

      const finalData = encryptionPassword
        ? await encryptBackupData(jsonStr, encryptionPassword)
        : jsonStr

      return new Response(finalData, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="backup-${recordId}.json"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    if (type === 'records') {
      const taskId = url.searchParams.get('taskId')
      if (taskId) {
        const records = await getBackupRecordsByTaskId(context.env.DB, taskId)
        return jsonResponse({ success: true, data: records }, 200)
      }
      const records = await getAllBackupRecords(context.env.DB)
      return jsonResponse({ success: true, data: records }, 200)
    }

    const tasks = await getBackupTaskList(context.env.DB)
    return jsonResponse({ success: true, data: tasks }, 200)
  } catch (error) {
    logger.error('Failed to get backup data', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('backup.errors.getFailed', '获取备份数据失败'), 500)
  }
})

export const onRequestPost = withAdmin(async (context: AdminContext) => {
  try {
    const body = await context.req.json<unknown>()
    const action = (body as Record<string, unknown>).action

    if (action === 'execute') {
      const taskId = (body as Record<string, unknown>).taskId as string
      if (!taskId) return errorResponse(t('backup.errors.missingTaskId', '缺少任务ID'), 400)

      const task = await getBackupTaskById(context.env.DB, taskId)
      if (!task) return errorResponse(t('backup.errors.taskNotFound', '备份任务不存在'), 404)

      const result = await executeBackupForTask(context.env.DB, taskId)

      await createAuditLog(context.env.DB, {
        id: crypto.randomUUID(),
        admin_id: context.tokenData.userId,
        action: 'EXECUTE_BACKUP',
        target_type: 'backup_task',
        target_id: taskId,
        details: JSON.stringify({ recordId: result.recordId, sizeBytes: result.sizeBytes }),
      })

      return jsonResponse({ success: true, data: result, message: t('backup.messages.executeSuccess', '备份执行成功') }, 200)
    }

    if (action === 'download') {
      const recordId = (body as Record<string, unknown>).recordId as string
      const encryptionPassword = (body as Record<string, unknown>).encryptionPassword as string | undefined
      if (!recordId) return errorResponse(t('backup.errors.missingRecordId', '缺少记录ID'), 400)

      const record = await getBackupRecordById(context.env.DB, recordId)
      if (!record) return errorResponse(t('backup.errors.recordNotFound', '备份记录不存在'), 404)

      const downloadToken = crypto.randomUUID()
      const storedValue = encryptionPassword
        ? `${recordId}:||:${encryptionPassword}`
        : recordId
      await context.env.AUTH_TOKENS.put(
        `backup-download:${downloadToken}`,
        storedValue,
        { expirationTtl: DOWNLOAD_TOKEN_TTL }
      )

      return jsonResponse({ success: true, data: { token: downloadToken, recordId } }, 200)
    }

    if (action === 'preview') {
      const parseResult = previewSchema.safeParse(body)
      if (!parseResult.success) {
        return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400)
      }

      const { data: rawData } = parseResult.data
      let restoreData: Record<string, unknown>

      if (rawData._encrypted) {
        const encryptionPassword = parseResult.data.encryptionPassword
        if (!encryptionPassword) {
          return errorResponse(t('backup.errors.encryptionPasswordRequired', '加密备份需要提供解密密码'), 400)
        }
        try {
          const decrypted = await decryptBackupData(JSON.stringify(rawData), encryptionPassword)
          restoreData = JSON.parse(decrypted) as Record<string, unknown>
        } catch {
          return errorResponse(t('backup.errors.decryptionFailed', '解密失败，密码可能不正确'), 400)
        }
      } else {
        restoreData = rawData
      }

      const meta = restoreData._meta as Record<string, unknown> | undefined
      if (!meta) {
        return errorResponse(t('backup.validation.invalidBackupFormat', '无效的备份数据格式：缺少 _meta 字段'), 400)
      }

      const preview: {
        meta: Record<string, unknown>
        tables: { name: string; rowCount: number; columns: string[] }[]
        kvNamespaces: { name: string; keyCount: number; sampleKeys: string[] }[]
        configs: { count: number; keys: string[] }
      } = {
        meta: meta as Record<string, unknown>,
        tables: [],
        kvNamespaces: [],
        configs: { count: 0, keys: [] },
      }

      const tableMap: Record<string, string> = {
        table_users: 'users',
        table_verification_codes: 'verification_codes',
        table_verification_code_cooldowns: 'verification_code_cooldowns',
        table_usage_logs: 'usage_logs',
        table_system_configs: 'system_configs',
        table_audit_logs: 'audit_logs',
        table_request_metrics: 'request_metrics',
        table_user_ai_configs: 'user_ai_configs',
        table_backup_tasks: 'backup_tasks',
        table_backup_records: 'backup_records',
      }

      for (const [key, tableName] of Object.entries(tableMap)) {
        const rows = restoreData[key]
        if (!Array.isArray(rows) || rows.length === 0) continue
        const columns = Object.keys(rows[0] as Record<string, unknown>)
        preview.tables.push({ name: tableName, rowCount: rows.length, columns })
      }

      if (restoreData.kv && typeof restoreData.kv === 'object') {
        const kvData = restoreData.kv as Record<string, Record<string, string>>
        for (const [nsKey, entries] of Object.entries(kvData)) {
          if (!entries || typeof entries !== 'object') continue
          const allKeys = Object.keys(entries)
          const filteredKeys = allKeys.filter((k) => !isSensitiveKvKey(k))
          preview.kvNamespaces.push({
            name: nsKey,
            keyCount: filteredKeys.length,
            sampleKeys: filteredKeys.slice(0, 5),
          })
        }
      }

      if (Array.isArray(restoreData.configs)) {
        const cfgs = restoreData.configs as Record<string, unknown>[]
        preview.configs = {
          count: cfgs.length,
          keys: cfgs.map((c) => String(c.key ?? '')).filter(Boolean),
        }
      }

      return jsonResponse({ success: true, data: preview }, 200)
    }

    if (action === 'request-restore') {
      const confirmToken = crypto.randomUUID()
      await context.env.AUTH_TOKENS.put(
        `restore-confirm:${confirmToken}`,
        String(Math.floor(Date.now() / 1000)),
        { expirationTtl: RESTORE_CONFIRM_TTL }
      )
      return jsonResponse({ success: true, data: { confirmToken } }, 200)
    }

    if (action === 'restore') {
      const parseResult = restoreSchema.safeParse(body)
      if (!parseResult.success) {
        return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400)
      }

      const { data: rawData, scope, encryptionPassword, confirmToken } = parseResult.data
      let restoreData: Record<string, unknown>

      const storedConfirm = await context.env.AUTH_TOKENS.get(`restore-confirm:${confirmToken}`)
      if (!storedConfirm) {
        return errorResponse(t('backup.errors.invalidConfirmToken', '恢复确认令牌无效或已过期，请重新请求'), 401)
      }
      await context.env.AUTH_TOKENS.delete(`restore-confirm:${confirmToken}`)

      if (rawData._encrypted) {
        if (!encryptionPassword) {
          return errorResponse(t('backup.errors.encryptionPasswordRequired', '加密备份需要提供解密密码'), 400)
        }
        try {
          const decrypted = await decryptBackupData(JSON.stringify(rawData), encryptionPassword)
          restoreData = JSON.parse(decrypted) as Record<string, unknown>
        } catch {
          return errorResponse(t('backup.errors.decryptionFailed', '解密失败，密码可能不正确'), 400)
        }
      } else {
        restoreData = rawData
      }

      const meta = restoreData._meta as Record<string, unknown>
      let restoredTables = 0
      let restoredConfigs = 0
      let restoredKvKeys = 0

      if (scope.includes('database')) {
        const tableMap: Record<string, string> = {
          table_users: 'users',
          table_verification_codes: 'verification_codes',
          table_verification_code_cooldowns: 'verification_code_cooldowns',
          table_usage_logs: 'usage_logs',
          table_system_configs: 'system_configs',
          table_audit_logs: 'audit_logs',
          table_request_metrics: 'request_metrics',
          table_user_ai_configs: 'user_ai_configs',
          table_backup_tasks: 'backup_tasks',
          table_backup_records: 'backup_records',
        }

        const allBatchStmts: D1PreparedStatement[] = []
        const tableRowCounts: { tableName: string; count: number }[] = []

        for (const [key, tableName] of Object.entries(tableMap)) {
          const rows = restoreData[key]
          if (!Array.isArray(rows) || rows.length === 0) continue
          if (!ALLOWED_EXPORT_TABLES.has(tableName)) {
            logger.warn('Skipping restore for disallowed table', { tableName })
            continue
          }
          const columns = Object.keys(rows[0] as Record<string, unknown>)
          const placeholders = columns.map(() => '?').join(', ')
          const sql = `INSERT OR REPLACE INTO ${tableName} (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders})`
          const stmt = context.env.DB.prepare(sql)
          for (const row of rows) {
            const values = columns.map((c) => (row as Record<string, unknown>)[c])
            allBatchStmts.push(stmt.bind(...values))
          }
          tableRowCounts.push({ tableName, count: rows.length })
        }

        if (allBatchStmts.length > 0) {
          try {
            const batchSize = 100
            for (let i = 0; i < allBatchStmts.length; i += batchSize) {
              await context.env.DB.batch(allBatchStmts.slice(i, i + batchSize))
            }
            restoredTables = tableRowCounts.length
          } catch (err) {
            logger.error('Failed to restore database tables (batch)', { error: err instanceof Error ? err.message : String(err) })
            return errorResponse(t('backup.errors.restoreDatabaseFailed', '数据库恢复失败，所有更改已回滚'), 500)
          }
        }
      }

      if (scope.includes('config')) {
        const configs = restoreData.configs
        if (Array.isArray(configs) && configs.length > 0) {
          try {
            const configStmts = (configs as Record<string, unknown>[]).map((c) => {
              if (!c.key || c.value === undefined) return null
              return context.env.DB.prepare(
                'INSERT OR REPLACE INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)'
              ).bind(c.key, c.value, c.updated_at ?? Math.floor(Date.now() / 1000))
            }).filter(Boolean) as D1PreparedStatement[]

            if (configStmts.length > 0) {
              await context.env.DB.batch(configStmts)
            }
            restoredConfigs = configStmts.length
          } catch (err) {
            logger.error('Failed to restore configs (batch)', { error: err instanceof Error ? err.message : String(err) })
            return errorResponse(t('backup.errors.restoreConfigFailed', '配置恢复失败，所有更改已回滚'), 500)
          }
        }
      }

      if (restoreData.kv && typeof restoreData.kv === 'object') {
        const kvData = restoreData.kv as Record<string, Record<string, string>>
        const kvMap: Record<string, KVNamespace> = {
          authTokens: context.env.AUTH_TOKENS,
          verificationCodes: context.env.VERIFICATION_CODES,
          ssrfCache: context.env.SSRF_CACHE,
        }
        for (const [nsKey, kv] of Object.entries(kvMap)) {
          const entries = kvData[nsKey]
          if (!entries || typeof entries !== 'object') continue
          try {
            let skippedSensitiveKeys = 0
            for (const [k, v] of Object.entries(entries)) {
              if (isSensitiveKvKey(k)) {
                skippedSensitiveKeys++
                continue
              }
              await kv.put(k, v)
              restoredKvKeys++
            }
            if (skippedSensitiveKeys > 0) {
              logger.info('Skipped sensitive KV keys during restore', { nsKey, skippedSensitiveKeys })
            }
          } catch (err) {
            logger.warn('Failed to restore KV namespace', { nsKey, error: err instanceof Error ? err.message : String(err) })
          }
        }
      }

      await createAuditLog(context.env.DB, {
        id: crypto.randomUUID(),
        admin_id: context.tokenData.userId,
        action: 'RESTORE_BACKUP',
        target_type: 'backup',
        target_id: String(meta.recordId ?? 'unknown'),
        details: JSON.stringify({ scope, restoredTables, restoredConfigs, restoredKvKeys }),
      })

      return jsonResponse({
        success: true,
        message: t('backup.messages.restoreComplete', '恢复操作完成'),
        data: { restoredTables, restoredConfigs, restoredKvKeys },
      }, 200)
    }

    const parseResult = createTaskSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400)
    }

    const { name, scope, frequency, retention_days } = parseResult.data
    const now = Math.floor(Date.now() / 1000)
    const taskId = crypto.randomUUID()
    const nextRun = calculateNextRunAt(frequency, now)

    await createBackupTask(context.env.DB, {
      id: taskId,
      name,
      scope: JSON.stringify(scope),
      frequency,
      retention_days,
      created_at: now,
      updated_at: now,
      next_run_at: nextRun,
    })

    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: context.tokenData.userId,
      action: 'CREATE_BACKUP_TASK',
      target_type: 'backup_task',
      target_id: taskId,
      details: JSON.stringify({ name, scope, frequency, retention_days }),
    })

    return jsonResponse({ success: true, data: { id: taskId }, message: t('backup.messages.createSuccess', '备份任务创建成功') }, 201)
  } catch (error) {
    logger.error('Failed to create/execute backup', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('backup.errors.operationFailed', '操作失败'), 500)
  }
})

export const onRequestPatch = withAdmin(async (context: AdminContext) => {
  try {
    const id = context.req.param('id')
    if (!id) return errorResponse(t('backup.errors.missingTaskId', '缺少任务ID'), 400)

    const task = await getBackupTaskById(context.env.DB, id)
    if (!task) return errorResponse(t('backup.errors.taskNotFound', '备份任务不存在'), 404)

    const body = await context.req.json<unknown>()
    const parseResult = updateTaskSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400)
    }

    const updates: Record<string, unknown> = { updated_at: Math.floor(Date.now() / 1000) }

    if (parseResult.data.name !== undefined) updates.name = parseResult.data.name
    if (parseResult.data.scope !== undefined) updates.scope = JSON.stringify(parseResult.data.scope)
    if (parseResult.data.frequency !== undefined) {
      updates.frequency = parseResult.data.frequency
      const nextRun = calculateNextRunAt(parseResult.data.frequency)
      updates.next_run_at = nextRun
    }
    if (parseResult.data.retention_days !== undefined) updates.retention_days = parseResult.data.retention_days
    if (parseResult.data.is_paused !== undefined) {
      updates.is_paused = parseResult.data.is_paused ? 1 : 0
      if (!parseResult.data.is_paused && task.frequency !== 'manual') {
        updates.next_run_at = calculateNextRunAt(task.frequency)
      }
    }

    await updateBackupTask(context.env.DB, id, updates)

    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: context.tokenData.userId,
      action: 'UPDATE_BACKUP_TASK',
      target_type: 'backup_task',
      target_id: id,
      details: JSON.stringify(parseResult.data),
    })

    return jsonResponse({ success: true, message: t('backup.messages.updateSuccess', '备份任务更新成功') }, 200)
  } catch (error) {
    logger.error('Failed to update backup task', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('backup.errors.updateFailed', '更新备份任务失败'), 500)
  }
})

export const onRequestDelete = withAdmin(async (context: AdminContext) => {
  try {
    const id = context.req.param('id')
    if (!id) return errorResponse(t('backup.errors.missingTaskId', '缺少任务ID'), 400)

    const task = await getBackupTaskById(context.env.DB, id)
    if (!task) return errorResponse(t('backup.errors.taskNotFound', '备份任务不存在'), 404)

    await deleteBackupTask(context.env.DB, id)

    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: context.tokenData.userId,
      action: 'DELETE_BACKUP_TASK',
      target_type: 'backup_task',
      target_id: id,
      details: JSON.stringify({ name: task.name }),
    })

    return jsonResponse({ success: true, message: t('backup.messages.deleteSuccess', '备份任务删除成功') }, 200)
  } catch (error) {
    logger.error('Failed to delete backup task', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('backup.errors.deleteFailed', '删除备份任务失败'), 500)
  }
})
