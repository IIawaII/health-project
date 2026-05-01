import { jsonResponse, errorResponse } from '../../utils/response';
import { getStats, getUsageStats } from '../../dao/log.dao';
import { getDailyUserStats } from '../../dao/user.dao';
import { getPerformanceOverview, getRequestTrend } from '../../dao/metrics.dao';
import { withAdmin } from '../../middleware/admin';
import { getLogger } from '../../utils/logger';
import { t } from '../../../shared/i18n/server';
import type { AdminContext } from '../../middleware/admin';

const logger = getLogger('AdminStats')

const defaultStats = { totalUsers: 0, todayNewUsers: 0, totalLogs: 0, todayLogs: 0 }
const defaultMetricsOverview = { totalRequests: 0, avgLatency: 0, maxLatency: 0, minLatency: 0, errorRate: 0 }

export const onRequestGet = withAdmin(async (context: AdminContext) => {
  const [statsResult, dailyResult, usageResult, metricsResult, trendResult] = await Promise.allSettled([
    getStats(context.env.DB),
    getDailyUserStats(context.env.DB, 30),
    getUsageStats(context.env.DB),
    getPerformanceOverview(context.env.DB, 24),
    getRequestTrend(context.env.DB, 24),
  ])

  if (statsResult.status === 'rejected') {
    logger.error('Failed to get stats', { error: statsResult.reason instanceof Error ? statsResult.reason.message : String(statsResult.reason) })
  }
  if (dailyResult.status === 'rejected') {
    logger.error('Failed to get daily user stats', { error: dailyResult.reason instanceof Error ? dailyResult.reason.message : String(dailyResult.reason) })
  }
  if (usageResult.status === 'rejected') {
    logger.error('Failed to get usage stats', { error: usageResult.reason instanceof Error ? usageResult.reason.message : String(usageResult.reason) })
  }
  if (metricsResult.status === 'rejected') {
    logger.error('Failed to get metrics overview', { error: metricsResult.reason instanceof Error ? metricsResult.reason.message : String(metricsResult.reason) })
  }
  if (trendResult.status === 'rejected') {
    logger.error('Failed to get request trend', { error: trendResult.reason instanceof Error ? trendResult.reason.message : String(trendResult.reason) })
  }

  const allFailed = statsResult.status === 'rejected' && dailyResult.status === 'rejected' && usageResult.status === 'rejected'
  if (allFailed) {
    return errorResponse(t('admin.errors.fetchStatsFailed', '获取统计数据失败'), 500)
  }

  const stats = statsResult.status === 'fulfilled' ? statsResult.value : defaultStats
  const dailyUserStats = dailyResult.status === 'fulfilled' ? dailyResult.value : []
  const usageStats = usageResult.status === 'fulfilled' ? usageResult.value : []
  const metricsOverview = metricsResult.status === 'fulfilled' ? metricsResult.value : defaultMetricsOverview
  const requestTrend = trendResult.status === 'fulfilled' ? trendResult.value : []

  return jsonResponse({
    success: true,
    data: {
      totalUsers: stats.totalUsers,
      todayNewUsers: stats.todayNewUsers,
      totalLogs: stats.totalLogs,
      todayLogs: stats.todayLogs,
      dailyUserStats,
      usageStats,
      metricsOverview,
      requestTrend,
    },
  }, 200)
});
