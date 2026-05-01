import { generateToken, generateDataKey } from '../../utils/crypto';
import { saveToken, saveRefreshToken, verifyRefreshToken, deleteRefreshToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getCookie, serializeCookie, getSecureCookieOptions, getAccessTokenCookieMaxAge, getRefreshTokenCookieMaxAge } from '../../utils/cookie';
import { generateCsrfToken, buildCsrfCookie, getCsrfCookieName } from '../../middleware/csrf';
import { findUserById, updateUserDataKey } from '../../dao/user.dao';
import { getLogger } from '../../utils/logger';
import type { AppContext } from '../../utils/handler';
import { t } from '../../../shared/i18n/server';
const logger = getLogger('Refresh')

export const onRequestPost = async (context: AppContext) => {
  try {
    const refreshToken = getCookie(context.req.raw, 'auth_refresh_token');

    if (!refreshToken) {
      return errorResponse(t('auth.refresh.noToken', '未提供刷新令牌'), 401);
    }

    // 验证 Refresh Token
    const refreshData = await verifyRefreshToken(context.env.AUTH_TOKENS, refreshToken);
    if (!refreshData) {
      return errorResponse(t('auth.refresh.tokenExpired', '刷新令牌已过期或无效'), 401);
    }

    // 从数据库获取最新的 data_key；老用户无 data_key 时自动生成
    let dataKey = refreshData.dataKey;
    let accountname: string | undefined;
    try {
      const dbUser = await findUserById(context.env.DB, refreshData.userId);
      if (dbUser) {
        if (!dbUser.data_key) {
          dataKey = generateDataKey();
          await updateUserDataKey(context.env.DB, dbUser.id, dataKey);
        } else {
          dataKey = dbUser.data_key;
        }
        accountname = dbUser.accountname ?? undefined;
      }
    } catch {
      // 忽略数据库查询错误，使用 token 中的 dataKey
    }

    // 生成新的 Access Token 和 Refresh Token（Token Rotation）
    const accessToken = generateToken();
    const newRefreshToken = generateToken();
    const tokenCreatedAt = new Date().toISOString();

    // 先保存新的 Token，再删除旧的，避免中间状态无可用 Token
    await saveToken(context.env.AUTH_TOKENS, accessToken, {
      userId: refreshData.userId,
      username: refreshData.username,
      email: refreshData.email,
      role: refreshData.role ?? 'user',
      dataKey,
      createdAt: tokenCreatedAt,
    });

    await saveRefreshToken(context.env.AUTH_TOKENS, newRefreshToken, {
      userId: refreshData.userId,
      username: refreshData.username,
      email: refreshData.email,
      role: refreshData.role ?? 'user',
      dataKey,
      createdAt: tokenCreatedAt,
    });

    // 使旧的 Refresh Token 失效
    await deleteRefreshToken(context.env.AUTH_TOKENS, refreshToken, refreshData.userId);

    const cookieOptions = getSecureCookieOptions(context.req.raw);
    const isSecure = context.req.raw.url.startsWith('https://')
    const existingCsrf = getCookie(context.req.raw, getCsrfCookieName())
    const csrfCookie = existingCsrf ? '' : buildCsrfCookie(generateCsrfToken(), isSecure)
    const cookies = [
      serializeCookie('auth_token', accessToken, { ...cookieOptions, maxAge: getAccessTokenCookieMaxAge(refreshData.role ?? 'user') }),
      serializeCookie('auth_refresh_token', newRefreshToken, { ...cookieOptions, maxAge: getRefreshTokenCookieMaxAge() }),
    ]
    if (csrfCookie) cookies.push(csrfCookie)
    return jsonResponse({
      success: true,
      message: t('auth.refresh.success', '令牌刷新成功'),
      user: {
        id: refreshData.userId,
        username: refreshData.username,
        email: refreshData.email,
        accountname,
        role: refreshData.role ?? 'user',
        dataKey,
      },
    }, 200, undefined, cookies.map((c) => `Set-Cookie: ${c}`));
  } catch (error) {
    logger.error('Refresh token error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('auth.refresh.error', '刷新令牌失败，请稍后重试'), 500);
  }
};
