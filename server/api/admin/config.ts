import { z } from 'zod';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getAllSystemConfigs, getSystemConfig, setSystemConfig } from '../../dao/config.dao';
import { createAuditLog } from '../../dao/audit.dao';
import { withAdmin } from '../../middleware/admin';
import { getLogger } from '../../utils/logger';
import { invalidateMaintenanceCache } from '../../utils/maintenanceCache';
import { invalidateSpaConfigCache } from '../../middleware/spa';
import { t } from '../../../shared/i18n/server';
import type { AdminContext } from '../../middleware/admin';

const logger = getLogger('AdminConfig')

const ALLOWED_CONFIG_KEYS = new Set([
  'max_requests_per_day',
  'maintenance_mode',
  'enable_registration',
  'metrics_sample_rate',
  'max_request_body_size',
  'smtp_timeout_ms',
  'max_login_failures',
  'account_lockout_seconds',
]);

const FLOAT_CONFIG_KEYS = new Set(['metrics_sample_rate'])

const NUMBER_CONFIG_RANGES: Record<string, { min: number; max: number }> = {
  max_requests_per_day: { min: 0, max: 10000 },
  metrics_sample_rate: { min: 0, max: 1 },
  max_request_body_size: { min: 1048576, max: 104857600 },
  smtp_timeout_ms: { min: 5000, max: 60000 },
  max_login_failures: { min: 1, max: 20 },
  account_lockout_seconds: { min: 60, max: 86400 },
};

export const onRequestGet = withAdmin(async (context: AdminContext) => {
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
    logger.error('Failed to get config', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('admin.errors.fetchConfigFailed', '获取配置失败'), 500);
  }
});

const updateSchema = z.record(z.string().min(1).max(500));

export const onRequestPut = withAdmin(async (context: AdminContext) => {
  try {
    const body = await context.req.json<unknown>();
    const parseResult = updateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400);
    }

    const updates = parseResult.data;
    const invalidKeys = Object.keys(updates).filter(k => !ALLOWED_CONFIG_KEYS.has(k));
    if (invalidKeys.length > 0) {
      return errorResponse(t('admin.errors.disallowedConfigKeys', '不允许修改的配置项: {{keys}}', { keys: invalidKeys.join(', ') }), 400);
    }

    for (const [key, value] of Object.entries(updates)) {
      const range = NUMBER_CONFIG_RANGES[key];
      if (range) {
        const num = Number(value);
        if (isNaN(num)) {
          return errorResponse(t('admin.errors.configMustBeNumber', '{{key}} 必须是数字', { key }), 400);
        }
        if (!FLOAT_CONFIG_KEYS.has(key) && !Number.isInteger(num)) {
          return errorResponse(t('admin.errors.configMustBeInteger', '{{key}} 必须是整数', { key }), 400);
        }
        if (num < range.min || num > range.max) {
          return errorResponse(t('admin.errors.configOutOfRange', '{{key}} 的值必须在 {{min}} 到 {{max}} 之间', { key, min: range.min, max: range.max }), 400);
        }
      }
    }

    const beforeValues: Record<string, string | null> = {};
    for (const key of Object.keys(updates)) {
      const existing = await getSystemConfig(context.env.DB, key);
      beforeValues[key] = existing?.value ?? null;
    }

    for (const [key, value] of Object.entries(updates)) {
      await setSystemConfig(context.env.DB, key, value);
    }

    if ('maintenance_mode' in updates) {
      invalidateMaintenanceCache();
    }

    invalidateSpaConfigCache();

    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: context.tokenData.userId,
      action: 'UPDATE_SYSTEM_CONFIG',
      target_type: 'config',
      target_id: null,
      details: JSON.stringify({
        keys: Object.keys(updates),
        before: beforeValues,
        after: updates,
      }),
    });

    return jsonResponse({ success: true, message: t('admin.messages.configUpdated', '配置更新成功') }, 200);
  } catch (error) {
    logger.error('Failed to update config', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('admin.errors.updateConfigFailed', '更新配置失败'), 500);
  }
});
