import { jsonResponse, errorResponse } from '../../lib/response';

interface TokenData {
  userId: string;
  username: string;
  email: string;
  createdAt: string;
}

export const onRequestGet = async (context: EventContext<{ AUTH_TOKENS: KVNamespace; USERS: KVNamespace }, string, Record<string, unknown>>) => {
  try {
    // 从请求头获取令牌
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('未提供有效的认证令牌', 401);
    }

    const token = authHeader.substring(7);

    // 验证令牌
    const tokenDataStr = await context.env.AUTH_TOKENS.get(`token:${token}`);
    if (!tokenDataStr) {
      return errorResponse('令牌已过期或无效', 401);
    }

    const tokenData: TokenData = JSON.parse(tokenDataStr);

    // 从 USERS KV 获取完整用户信息（包括头像和邮箱）
    const userKey = `user:${tokenData.userId}`;
    const userDataStr = await context.env.USERS.get(userKey);

    let avatar: string | undefined;
    let email = tokenData.email;
    if (userDataStr) {
      const userData = JSON.parse(userDataStr) as Record<string, unknown>;
      avatar = typeof userData.avatar === 'string' ? userData.avatar : undefined;
      if (typeof userData.email === 'string') {
        email = userData.email;
      }
    }

    return jsonResponse({
      success: true,
      user: {
        id: tokenData.userId,
        username: tokenData.username,
        email,
        avatar,
      },
    }, 200);
  } catch (error) {
    console.error('Token verification error:', error);
    return errorResponse('验证失败，请稍后重试', 500);
  }
};
