/**
 * 管理后台 - 性能监控 API
 * 提供请求量、延迟、错误率等监控数据
 */

import { z } from 'zod'
import { jsonResponse, errorResponse } from '../../utils/response'
import {
  getPerformanceOverview,
  getRequestTrend,
  getPathStats,
  getStatusCodeDistribution,
  getRecentErrors,
} from '../../dao/metrics.dao'
import { withAdmin } from '../../middleware/admin'
import { getLogger } from '../../utils/logger'
import { t } from '../../../shared/i18n/server'
import type { AdminContext } from '../../middleware/admin'

const logger = getLogger('AdminMetrics')

const hoursSchema = z.coerce.number().min(1).max(720).default(24)

/** GET /api/admin/metrics/overview?hours=24 */
export const onRequestGetOverview = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url)
    const hours = hoursSchema.parse(Number(url.searchParams.get('hours')) || 24)
    const data = await getPerformanceOverview(context.env.DB, hours)
    return jsonResponse({ success: true, data }, 200)
  } catch (error) {
    logger.error('Failed to get metrics overview', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('admin.errors.fetchMetricsOverviewFailed', '获取性能概览失败'), 500)
  }
})

/** GET /api/admin/metrics/trend?hours=24 */
export const onRequestGetTrend = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url)
    const hours = hoursSchema.parse(Number(url.searchParams.get('hours')) || 24)
    const data = await getRequestTrend(context.env.DB, hours)
    return jsonResponse({ success: true, data }, 200)
  } catch (error) {
    logger.error('Failed to get request trend', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('admin.errors.fetchRequestTrendFailed', '获取请求趋势失败'), 500)
  }
})

/** GET /api/admin/metrics/paths?hours=24 */
export const onRequestGetPaths = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url)
    const hours = hoursSchema.parse(Number(url.searchParams.get('hours')) || 24)
    const data = await getPathStats(context.env.DB, hours)
    return jsonResponse({ success: true, data }, 200)
  } catch (error) {
    logger.error('Failed to get path stats', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('admin.errors.fetchPathStatsFailed', '获取路径统计失败'), 500)
  }
})

/** GET /api/admin/metrics/status-codes?hours=24 */
export const onRequestGetStatusCodes = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url)
    const hours = hoursSchema.parse(Number(url.searchParams.get('hours')) || 24)
    const data = await getStatusCodeDistribution(context.env.DB, hours)
    return jsonResponse({ success: true, data }, 200)
  } catch (error) {
    logger.error('Failed to get status codes', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('admin.errors.fetchStatusCodeDistFailed', '获取状态码分布失败'), 500)
  }
})

/** GET /api/admin/metrics/errors */
export const onRequestGetErrors = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url)
    const limit = Number(url.searchParams.get('limit')) || 50
    const data = await getRecentErrors(context.env.DB, Math.min(limit, 200))
    return jsonResponse({ success: true, data }, 200)
  } catch (error) {
    logger.error('Failed to get recent errors', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('admin.errors.fetchErrorLogsFailed', '获取错误日志失败'), 500)
  }
})
