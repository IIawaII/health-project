import { jsonResponse } from '../../utils/response';
import { getSystemConfig } from '../../dao/config.dao';
import { getLogger } from '../../utils/logger';
import type { AppContext } from '../../utils/handler';

const logger = getLogger('PublicConfig')

export async function onRequestGet(context: AppContext) {
  try {
    const clientIP = context.req.raw.headers.get('CF-Connecting-IP') || 'unknown'
    try {
      const { checkRateLimit } = await import('../../utils/rateLimit')
      const rateResult = await checkRateLimit({
        env: context.env,
        key: `${clientIP}:public-config`,
        limit: 60,
        windowSeconds: 60,
      })
      if (!rateResult.allowed) {
        return jsonResponse({ error: '请求过于频繁，请稍后重试' }, 429)
      }
    } catch (rateLimitErr) {
      logger.debug('Rate limit check failed for public config, allowing through', {
        error: rateLimitErr instanceof Error ? rateLimitErr.message : String(rateLimitErr),
      })
    }

    const [maintenanceMode, enableRegistration] = await Promise.all([
      getSystemConfig(context.env.DB, 'maintenance_mode'),
      getSystemConfig(context.env.DB, 'enable_registration'),
    ])

    return jsonResponse({
      maintenance_mode: maintenanceMode?.value === 'true',
      enable_registration: enableRegistration?.value !== 'false',
    }, 200)
  } catch (error) {
    logger.error('Failed to get public config', { error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({
      maintenance_mode: false,
      enable_registration: true,
    }, 200)
  }
}
