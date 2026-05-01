import { z } from 'zod';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getAuditLogs, clearAllAuditLogs } from '../../dao/audit.dao';
import { withAdmin } from '../../middleware/admin';
import { getLogger } from '../../utils/logger';
import { t } from '../../../shared/i18n/server';
import type { AdminContext } from '../../middleware/admin';

const logger = getLogger('AdminAudit')

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  action: z.string().optional(),
});

export const onRequestGet = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url);
    const parseResult = querySchema.safeParse({
      page: url.searchParams.get('page') ?? '1',
      pageSize: url.searchParams.get('pageSize') ?? '20',
      action: url.searchParams.get('action') ?? undefined,
    });
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400);
    }

    const { page, pageSize, action } = parseResult.data;
    const offset = (page - 1) * pageSize;

    const result = await getAuditLogs(context.env.DB, {
      limit: pageSize,
      offset,
      action,
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
    logger.error('Failed to get audit logs', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('admin.errors.fetchAuditLogsFailed', '获取审计日志失败'), 500);
  }
});

export const onRequestDelete = withAdmin(async (context: AdminContext) => {
  try {
    const deleted = await clearAllAuditLogs(context.env.DB)
    logger.info('Cleared all audit logs', { deleted })
    return jsonResponse({ success: true, data: { deleted } }, 200)
  } catch (error) {
    logger.error('Failed to clear audit logs', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('admin.errors.clearAuditLogsFailed', '清空审计日志失败'), 500)
  }
})
