import { jsonResponse, errorResponse } from '../../utils/response';
import { checkRateLimit, buildRateLimitKey } from '../../utils/rateLimit';
import { usernameExists, emailExists } from '../../dao/user.dao';
import type { AppContext } from '../../utils/handler';

interface CheckRequest {
  username?: string;
  email?: string;
}

export const onRequestPost = async (context: AppContext) => {
  try {
    const body = await context.req.json<CheckRequest>();
    const { username, email } = body;

    if (username === undefined && email === undefined) {
      return errorResponse('请提供 username 或 email 参数', 400);
    }

    // 速率限制：每个 IP 每分钟最多 10 次可用性检查，防止用户名/邮箱枚举。
    // 该接口仅用于注册页辅助提示；若限流存储暂时不可用，则降级放行，避免整个注册表单不可用。
    try {
      const rateLimit = await checkRateLimit({
        kv: context.env.AUTH_TOKENS,
        key: buildRateLimitKey({ request: context.req.raw }, 'check'),
        limit: 10,
        windowSeconds: 60,
      });
      if (!rateLimit.allowed) {
        return errorResponse('检查过于频繁，请稍后再试', 429);
      }
    } catch (rateLimitError) {
      console.warn('Check availability rate limit degraded:', rateLimitError);
    }

    if (username !== undefined) {
      const exists = await usernameExists(context.env.DB, username);
      return jsonResponse({ available: !exists, field: 'username' }, 200);
    }

    const exists = await emailExists(context.env.DB, email as string);
    return jsonResponse({ available: !exists, field: 'email' }, 200);
  } catch (error) {
    console.error('Check availability error:', error);
    return errorResponse('检查失败，请稍后重试', 500);
  }
};
