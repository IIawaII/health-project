import { deleteToken, deleteRefreshToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getCookie, serializeCookie, getSecureCookieOptions } from '../../utils/cookie';
import { getCsrfCookieName } from '../../middleware/csrf';
import { getLogger } from '../../utils/logger';
import type { AppContext } from '../../utils/handler';
import { t } from '../../../shared/i18n/server';
const logger = getLogger('Logout')

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

    // 读取 refresh token（仅从 Cookie）
    const refreshToken = getCookie(context.req.raw, 'auth_refresh_token');

    // 删除 access token
    if (token) {
      await deleteToken(context.env.AUTH_TOKENS, token);
    }

    // 删除 refresh token 及其索引
    if (refreshToken) {
      await deleteRefreshToken(context.env.AUTH_TOKENS, refreshToken);
    }

    const cookieOptions = getSecureCookieOptions(context.req.raw);
    const cookies = [
      serializeCookie('auth_token', '', { ...cookieOptions, maxAge: 0 }),
      serializeCookie('auth_refresh_token', '', { ...cookieOptions, maxAge: 0 }),
      serializeCookie(getCsrfCookieName(), '', { ...cookieOptions, httpOnly: false, sameSite: 'Strict', maxAge: 0 }),
    ]
    return jsonResponse({
      success: true,
      message: t('auth.logout.success'),
    }, 200, undefined, cookies.map((c) => `Set-Cookie: ${c}`));
  } catch (error) {
    logger.error('Logout error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('auth.logout.error'), 500);
  }
};
