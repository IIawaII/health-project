/**
 * Metrics DAO - 性能监控数据查询
 */

import { count, avg, max, min, sql, gte, lte, inArray } from 'drizzle-orm'
import { getDb, requestMetrics, type DbClient } from '../db'
import { getLogger } from '../utils/logger'

function db(d1: D1Database): DbClient {
  return getDb(d1)
}

/** 获取整体性能概览 */
export async function getPerformanceOverview(
  d1: D1Database,
  hours: number = 24
): Promise<{
  totalRequests: number
  avgLatency: number
  maxLatency: number
  minLatency: number
  errorRate: number
}> {
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const drizzleDb = db(d1)

  const [totalResult, latencyResult, errorResult] = await Promise.all([
    drizzleDb
      .select({ total: count() })
      .from(requestMetrics)
      .where(gte(requestMetrics.created_at, since)),
    drizzleDb
      .select({
        avg: avg(requestMetrics.latency_ms).mapWith(Number),
        max: max(requestMetrics.latency_ms).mapWith(Number),
        min: min(requestMetrics.latency_ms).mapWith(Number),
      })
      .from(requestMetrics)
      .where(gte(requestMetrics.created_at, since)),
    drizzleDb
      .select({ errors: count() })
      .from(requestMetrics)
      .where(
        sql`${requestMetrics.created_at} >= ${since} AND ${requestMetrics.status_code} >= 400`
      ),
  ])

  const total = totalResult[0]?.total ?? 0
  return {
    totalRequests: total,
    avgLatency: Math.round(latencyResult[0]?.avg ?? 0),
    maxLatency: latencyResult[0]?.max ?? 0,
    minLatency: latencyResult[0]?.min ?? 0,
    errorRate: total > 0 ? Math.round(((errorResult[0]?.errors ?? 0) / total) * 10000) / 100 : 0,
  }
}

/** 获取按小时分组的请求量趋势 */
export async function getRequestTrend(
  d1: D1Database,
  hours: number = 24
): Promise<{ hour: string; count: number; avgLatency: number }[]> {
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const result = await db(d1)
    .select({
      hour: sql<string>`strftime('%Y-%m-%d %H:00', ${requestMetrics.created_at}, 'unixepoch', '+8 hours')`,
      count: count(),
      avgLatency: avg(requestMetrics.latency_ms).mapWith(Number),
    })
    .from(requestMetrics)
    .where(gte(requestMetrics.created_at, since))
    .groupBy(sql`strftime('%Y-%m-%d %H:00', ${requestMetrics.created_at}, 'unixepoch', '+8 hours')`)
    .orderBy(sql`strftime('%Y-%m-%d %H:00', ${requestMetrics.created_at}, 'unixepoch', '+8 hours') ASC`)
  return result.map((r) => ({
    hour: r.hour,
    count: r.count,
    avgLatency: Math.round(r.avgLatency),
  }))
}

/** 获取按路径分组的请求统计 */
export async function getPathStats(
  d1: D1Database,
  hours: number = 24
): Promise<{ path: string; count: number; avgLatency: number; errorCount: number }[]> {
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const result = await db(d1)
    .select({
      path: requestMetrics.path,
      count: count(),
      avgLatency: avg(requestMetrics.latency_ms).mapWith(Number),
      errorCount: sql<number>`SUM(CASE WHEN ${requestMetrics.status_code} >= 400 THEN 1 ELSE 0 END)`,
    })
    .from(requestMetrics)
    .where(gte(requestMetrics.created_at, since))
    .groupBy(requestMetrics.path)
    .limit(20)
  return result.map((r) => ({
    path: r.path,
    count: r.count,
    avgLatency: Math.round(r.avgLatency),
    errorCount: Number(r.errorCount),
  })).sort((a, b) => b.count - a.count)
}

/** 获取状态码分布 */
export async function getStatusCodeDistribution(
  d1: D1Database,
  hours: number = 24
): Promise<{ statusCode: number; count: number }[]> {
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const result = await db(d1)
    .select({
      statusCode: requestMetrics.status_code,
      count: count(),
    })
    .from(requestMetrics)
    .where(gte(requestMetrics.created_at, since))
    .groupBy(requestMetrics.status_code)
  return result.map((r) => ({
    statusCode: r.statusCode,
    count: r.count,
  })).sort((a, b) => b.count - a.count)
}

/** 获取最近的错误日志 */
export async function getRecentErrors(
  d1: D1Database,
  limit: number = 50
): Promise<{ id: string; path: string; method: string; statusCode: number; latencyMs: number; createdAt: number }[]> {
  const result = await db(d1)
    .select({
      id: requestMetrics.id,
      path: requestMetrics.path,
      method: requestMetrics.method,
      statusCode: requestMetrics.status_code,
      latencyMs: requestMetrics.latency_ms,
      createdAt: requestMetrics.created_at,
    })
    .from(requestMetrics)
    .where(sql`${requestMetrics.status_code} >= 400`)
    .orderBy(sql`${requestMetrics.created_at} DESC`)
    .limit(limit)
  return result
}

/** 清理过期监控数据（保留 7 天） */
export async function cleanupOldMetrics(d1: D1Database): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400
  const BATCH_SIZE = 500
  let totalDeleted = 0

  for (let i = 0; i < 20; i++) {
    const rows = await db(d1)
      .select({ id: requestMetrics.id })
      .from(requestMetrics)
      .where(lte(requestMetrics.created_at, cutoff))
      .limit(BATCH_SIZE)
      .all()

    if (rows.length === 0) break

    await db(d1)
      .delete(requestMetrics)
      .where(inArray(requestMetrics.id, rows.map((r) => r.id)))
      .run()

    totalDeleted += rows.length

    if (rows.length < BATCH_SIZE) break
  }

  if (totalDeleted > 0) {
    const logger = getLogger('Metrics')
    logger.info('Metrics cleanup completed', { totalDeleted })
  }
}
