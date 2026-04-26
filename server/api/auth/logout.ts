import { deleteToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getCookie, serializeCookie, getSecureCookieOptions } from '../../utils/cookie';
import type { AppContext } from '../../utils/handler';

export const onRequestPost = async (context: AppContext) => {
  try {
    // 优先从 Cookie 读取 token，fallback 到 Authorization header
    let token = getCookie(context.req.raw, 'auth_token');
    if (!token) {
      const authHeader = context.req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (token) {
      // 删除令牌及其索引
      await deleteToken(context.env.AUTH_TOKENS, token);
    }

    const cookieOptions = getSecureCookieOptions(context.req.raw);
    return jsonResponse({
      success: true,
      message: '登出成功',
    }, 200, {
      'Set-Cookie': [
        serializeCookie('auth_token', '', { ...cookieOptions, maxAge: 0 }),
        serializeCookie('auth_refresh_token', '', { ...cookieOptions, maxAge: 0 }),
      ].join(', '),
    });
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse('登出失败，请稍后重试', 500);
  }
};
