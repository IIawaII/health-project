import { z } from 'zod';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getAllSystemConfigs, getSystemConfig, setSystemConfig } from '../../dao/config.dao';
import { createAuditLog } from '../../dao/audit.dao';
import { verifyToken } from '../../utils/auth';
import { withAdmin } from '../../middleware/admin';
import type { AppContext } from '../../utils/handler';

/** 允许管理员通过 API 修改的系统配置键白名单 */
const ALLOWED_CONFIG_KEYS = new Set([
  'site_name',
  'welcome_message',
  'max_requests_per_day',
  'maintenance_mode',
  'enable_registration',
]);

export const onRequestGet = withAdmin(async (context: AppContext) => {
  try {
    const url = new URL(context.req.url);
    const key = url.searchParams.get('key');

    if (key) {
      const config = await getSystemConfig(context.env.DB, key);
      return jsonResponse({ success: true, data: config }, 200);
    }

    const configs = await getAllSystemConfigs(context.env.DB);
    return jsonResponse({ success: true, data: configs }, 200);
  } catch (error) {
    console.error('Admin config get error:', error);
    return errorResponse('获取配置失败', 500);
  }
});

const updateSchema = z.record(z.string().min(1).max(500));

export const onRequestPut = withAdmin(async (context: AppContext) => {
  try {
    const body = await context.req.json<unknown>();
    const parseResult = updateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || '参数错误', 400);
    }

    const updates = parseResult.data;
    const invalidKeys = Object.keys(updates).filter(k => !ALLOWED_CONFIG_KEYS.has(k));
    if (invalidKeys.length > 0) {
      return errorResponse(`不允许修改的配置项: ${invalidKeys.join(', ')}`, 400);
    }

    for (const [key, value] of Object.entries(updates)) {
      await setSystemConfig(context.env.DB, key, value);
    }

    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: tokenData?.userId ?? 'unknown',
      action: 'UPDATE_SYSTEM_CONFIG',
      target_type: 'config',
      target_id: null,
      details: JSON.stringify({ keys: Object.keys(updates) }),
    });

    return jsonResponse({ success: true, message: '配置更新成功' }, 200);
  } catch (error) {
    console.error('Admin config update error:', error);
    return errorResponse('更新配置失败', 500);
  }
});
