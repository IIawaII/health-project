import { z } from 'zod';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getUsageLogs, clearAllUsageLogs } from '../../dao/log.dao';
import { createAuditLog } from '../../dao/audit.dao';
import { withAdmin } from '../../middleware/admin';
import { getLogger } from '../../utils/logger';
import { t } from '../../../shared/i18n/server';
import type { AdminContext } from '../../middleware/admin';

const logger = getLogger('AdminLogs')

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  action: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function parseDateToTimestamp(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  return Math.floor(d.getTime() / 1000);
}

export const onRequestGet = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url);
    const parseResult = querySchema.safeParse({
      page: url.searchParams.get('page') ?? '1',
      pageSize: url.searchParams.get('pageSize') ?? '20',
      action: url.searchParams.get('action') || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
    });
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400);
    }

    const { page, pageSize, action, startDate, endDate } = parseResult.data;
    const offset = (page - 1) * pageSize;

    const result = await getUsageLogs(context.env.DB, {
      limit: pageSize,
      offset,
      action,
      startDate: parseDateToTimestamp(startDate),
      endDate: parseDateToTimestamp(endDate),
    });

    return jsonResponse({
      success: true,
      data: {
        logs: result.logs,
        total: result.total,
        page,
        pageSize,
      },
    }, 200);
  } catch (error) {
    logger.error('Failed to get logs', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('admin.errors.fetchLogsFailed', '获取日志失败'), 500);
  }
})

export const onRequestDelete = withAdmin(async (context: AdminContext) => {
  try {
    const deleted = await clearAllUsageLogs(context.env.DB)
    logger.info('Cleared all usage logs', { deleted })
    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: context.tokenData.userId,
      action: 'CLEAR_USAGE_LOGS',
      target_type: 'usage_logs',
      target_id: 'all',
      details: `Cleared ${deleted} usage log(s)`,
    })
    return jsonResponse({ success: true, data: { deleted } }, 200)
  } catch (error) {
    logger.error('Failed to clear usage logs', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('admin.errors.clearLogsFailed', '清空使用日志失败'), 500)
  }
})
