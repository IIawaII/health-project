import { deleteToken, deleteRefreshToken, verifyToken, verifyRefreshToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getCookie, serializeCookie, getSecureCookieOptions } from '../../utils/cookie';
import { getCsrfCookieName } from '../../middleware/csrf';
import { getLogger } from '../../utils/logger';
import type { AppContext } from '../../utils/handler';
import { t } from '../../../shared/i18n/server';
const logger = getLogger('Logout')

export const onRequestPost = async (context: AppContext) => {
  try {
    let token = getCookie(context.req.raw, 'auth_token');
    if (!token) {
      const authHeader = context.req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    const refreshToken = getCookie(context.req.raw, 'auth_refresh_token');

    let userId: string | undefined
    if (token) {
      const tokenData = await verifyToken({ request: context.req.raw, env: context.env })
      userId = tokenData?.userId
      await deleteToken(context.env.AUTH_TOKENS, token, userId);
    }

    if (refreshToken) {
      if (!userId) {
        const refreshData = await verifyRefreshToken(context.env.AUTH_TOKENS, refreshToken)
        userId = refreshData?.userId
      }
      await deleteRefreshToken(context.env.AUTH_TOKENS, refreshToken, userId);
    }

    const cookieOptions = getSecureCookieOptions(context.req.raw);
    const cookies = [
      serializeCookie('auth_token', '', { ...cookieOptions, maxAge: 0 }),
      serializeCookie('auth_refresh_token', '', { ...cookieOptions, maxAge: 0 }),
      serializeCookie(getCsrfCookieName(context.req.raw), '', { ...cookieOptions, httpOnly: false, sameSite: 'Strict', maxAge: 0 }),
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
