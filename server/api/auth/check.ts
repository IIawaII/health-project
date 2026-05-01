import { jsonResponse, errorResponse } from '../../utils/response';
import { checkRateLimit, buildRateLimitKey } from '../../utils/rateLimit';
import { usernameExists, emailExists } from '../../dao/user.dao';
import { getLogger } from '../../utils/logger';
import type { AppContext } from '../../utils/handler';
import { t } from '../../../shared/i18n/server';
const logger = getLogger('Check')

interface CheckRequest {
  username?: string;
  email?: string;
}

export const onRequestPost = async (context: AppContext) => {
  try {
    const body = await context.req.json<CheckRequest>();
    const { username, email } = body;

    if (username === undefined && email === undefined) {
      return errorResponse(t('auth.register.errors.missingField', '请提供用户名或邮箱参数'), 400);
    }

    // 速率限制：每个 IP 每分钟最多 10 次可用性检查，防止用户名/邮箱枚举。
    // 该接口仅用于注册页辅助提示；若限流存储暂时不可用，则降级放行，避免整个注册表单不可用。
    try {
      const rateLimit = await checkRateLimit({
        env: context.env,
        key: buildRateLimitKey({ request: context.req.raw }, 'check'),
        limit: 20,
        windowSeconds: 60,
      });
      if (!rateLimit.allowed) {
        return errorResponse(t('auth.register.errors.tooManyChecks', '检查过于频繁，请稍后再试'), 429);
      }
    } catch (rateLimitError) {
      logger.warn('Rate limit degraded', { error: rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError) });
    }

    if (username !== undefined) {
      const exists = await usernameExists(context.env.DB, username);
      return jsonResponse({ available: !exists, field: 'username' }, 200);
    }

    const exists = await emailExists(context.env.DB, email as string);
    return jsonResponse({ available: !exists, field: 'email' }, 200);
  } catch (error) {
    logger.error('Check availability error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('auth.register.errors.checkFailed', '检查失败，请稍后重试'), 500);
  }
};
