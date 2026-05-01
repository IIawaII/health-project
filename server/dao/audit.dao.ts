/**
 * Audit DAO - 审计日志 (Drizzle ORM)
 */

import { eq, and, count, sql } from 'drizzle-orm'
import { getDb, auditLogs, type DbClient } from '../db'
import { getLogger } from '../utils/logger'

const logger = getLogger('AuditDAO')

export interface AuditLog {
  id: string
  admin_id: string
  action: string
  target_type: string | null
  target_id: string | null
  details: string | null
  created_at: number
}

function db(d1: D1Database): DbClient {
  return getDb(d1)
}

export async function createAuditLog(
  d1: D1Database,
  log: Omit<AuditLog, 'created_at'>
): Promise<void> {
  logger.info('Creating audit log', { action: log.action, admin_id: log.admin_id })
  await db(d1)
    .insert(auditLogs)
    .values({
      id: log.id,
      admin_id: log.admin_id,
      action: log.action,
      target_type: log.target_type ?? null,
      target_id: log.target_id ?? null,
      details: log.details ?? null,
      created_at: Math.floor(Date.now() / 1000),
    })
    .run()
}

export async function clearAllAuditLogs(d1: D1Database): Promise<number> {
  const drizzleDb = db(d1)
  const result = await drizzleDb.delete(auditLogs).run()
  return result.meta.changes
}

export async function getAuditLogs(
  d1: D1Database,
  options: { limit?: number; offset?: number; action?: string } = {}
): Promise<{ logs: AuditLog[]; total: number }> {
  const drizzleDb = db(d1)
  const limit = options.limit ?? 20
  const offset = options.offset ?? 0

  const conditions = []
  if (options.action) {
    conditions.push(eq(auditLogs.action, options.action))
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [logsResult, countResult] = await Promise.all([
    drizzleDb
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(sql`${auditLogs.created_at} DESC`)
      .limit(limit)
      .offset(offset),
    drizzleDb
      .select({ total: count() })
      .from(auditLogs)
      .where(whereClause),
  ])

  return {
    logs: logsResult as AuditLog[],
    total: countResult[0]?.total ?? 0,
  }
}
