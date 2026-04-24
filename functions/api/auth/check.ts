import { jsonResponse, errorResponse } from '../../lib/response';

interface CheckRequest {
  username?: string;
  email?: string;
}

export const onRequestPost = async (context: EventContext<{ USERS: KVNamespace }, string, Record<string, unknown>>) => {
  try {
    const body = await context.request.json<CheckRequest>();
    const { username, email } = body;

    if (username !== undefined) {
      const existing = await context.env.USERS.get(`username:${username}`);
      return jsonResponse({ available: !existing, field: 'username' }, 200);
    }

    if (email !== undefined) {
      const existing = await context.env.USERS.get(`email:${email}`);
      return jsonResponse({ available: !existing, field: 'email' }, 200);
    }

    return errorResponse('请提供 username 或 email 参数', 400);
  } catch (error) {
    console.error('Check availability error:', error);
    return errorResponse('检查失败，请稍后重试', 500);
  }
};
