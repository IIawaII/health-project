/**
 * Log DAO - 使用日志与统计 (Drizzle ORM)
 */

import { eq, and, gte, lte, count, sql } from 'drizzle-orm'
import { getDb, usageLogs, users, type DbClient } from '../db'

export interface UsageLog {
  id: string
  user_id: string | null
  action: string
  metadata: string | null
  created_at: number
}

function db(d1: D1Database): DbClient {
  return getDb(d1)
}

export async function createUsageLog(
  d1: D1Database,
  log: Omit<UsageLog, 'created_at'>
): Promise<void> {
  await db(d1)
    .insert(usageLogs)
    .values({
      id: log.id,
      user_id: log.user_id ?? null,
      action: log.action,
      metadata: log.metadata ?? null,
      created_at: Math.floor(Date.now() / 1000),
    })
    .run()
}

export async function getUsageLogs(
  d1: D1Database,
  options: { limit?: number; offset?: number; action?: string; startDate?: number; endDate?: number } = {}
): Promise<{ logs: (UsageLog & { username: string | null })[]; total: number }> {
  const drizzleDb = db(d1)
  const conditions = []

  if (options.action) {
    conditions.push(eq(usageLogs.action, options.action))
  }
  if (options.startDate !== undefined) {
    conditions.push(gte(usageLogs.created_at, options.startDate))
  }
  if (options.endDate !== undefined) {
    conditions.push(lte(usageLogs.created_at, options.endDate))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const limit = options.limit ?? 20
  const offset = options.offset ?? 0

  const [logsResult, countResult] = await Promise.all([
    drizzleDb
      .select({
        id: usageLogs.id,
        user_id: usageLogs.user_id,
        username: users.username,
        action: usageLogs.action,
        metadata: usageLogs.metadata,
        created_at: usageLogs.created_at,
      })
      .from(usageLogs)
      .leftJoin(users, eq(usageLogs.user_id, users.id))
      .where(whereClause)
      .orderBy(sql`${usageLogs.created_at} DESC`)
      .limit(limit)
      .offset(offset),
    drizzleDb
      .select({ total: count() })
      .from(usageLogs)
      .where(whereClause),
  ])

  return {
    logs: logsResult as (UsageLog & { username: string | null })[],
    total: countResult[0]?.total ?? 0,
  }
}

export async function getUsageStats(
  d1: D1Database,
  startDate?: number,
  endDate?: number
): Promise<{ action: string; count: number }[]> {
  const conditions = []
  if (startDate !== undefined) conditions.push(gte(usageLogs.created_at, startDate))
  if (endDate !== undefined) conditions.push(lte(usageLogs.created_at, endDate))
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const result = await db(d1)
    .select({
      action: usageLogs.action,
      count: count(),
    })
    .from(usageLogs)
    .where(whereClause)
    .groupBy(usageLogs.action)
  return (result as { action: string; count: number }[]).sort((a, b) => b.count - a.count)
}

export async function getUserDailyUsageCount(
  d1: D1Database,
  userId: string,
  action?: string
): Promise<number> {
  const now = new Date()
  const todayStart = Math.floor(new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()).getTime() / 1000)

  const conditions = [
    eq(usageLogs.user_id, userId),
    gte(usageLogs.created_at, todayStart),
  ]
  if (action) {
    conditions.push(eq(usageLogs.action, action))
  }

  const result = await db(d1)
    .select({ count: count() })
    .from(usageLogs)
    .where(and(...conditions))
  return result[0]?.count ?? 0
}

export async function clearAllUsageLogs(d1: D1Database): Promise<number> {
  const drizzleDb = db(d1)
  const result = await drizzleDb.delete(usageLogs).run()
  return result.meta.changes
}

export async function getStats(d1: D1Database): Promise<{
  totalUsers: number
  todayNewUsers: number
  totalLogs: number
  todayLogs: number
}> {
  const drizzleDb = db(d1)

  const now = new Date()
  const todayStart = Math.floor(new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()).getTime() / 1000)

  const [totalUsersResult, todayNewUsersResult, totalLogsResult, todayLogsResult] = await Promise.all([
    drizzleDb.select({ count: count() }).from(users),
    drizzleDb
      .select({ count: count() })
      .from(users)
      .where(gte(users.created_at, todayStart)),
    drizzleDb.select({ count: count() }).from(usageLogs),
    drizzleDb
      .select({ count: count() })
      .from(usageLogs)
      .where(gte(usageLogs.created_at, todayStart)),
  ])

  return {
    totalUsers: totalUsersResult[0]?.count ?? 0,
    todayNewUsers: todayNewUsersResult[0]?.count ?? 0,
    totalLogs: totalLogsResult[0]?.count ?? 0,
    todayLogs: todayLogsResult[0]?.count ?? 0,
  }
}
