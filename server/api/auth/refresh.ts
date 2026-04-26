import { generateToken, generateDataKey } from '../../utils/crypto';
import { saveToken, saveRefreshToken, verifyRefreshToken, deleteRefreshToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getCookie, serializeCookie, getSecureCookieOptions, getAccessTokenCookieMaxAge, getRefreshTokenCookieMaxAge } from '../../utils/cookie';
import { findUserById, updateUserDataKey } from '../../dao/user.dao';
import type { AppContext } from '../../utils/handler';
import i18n from '../../../src/i18n';

const t = i18n.t.bind(i18n);

export const onRequestPost = async (context: AppContext) => {
  try {
    // 优先从 Cookie 读取 refresh token，fallback 到 body（向后兼容）
    let refreshToken = getCookie(context.req.raw, 'auth_refresh_token');
    if (!refreshToken) {
    const body = await context.req.json<{ refreshToken?: string }>().catch(() => ({} as { refreshToken?: string }));
    refreshToken = body.refreshToken;
    }

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
    try {
      const dbUser = await findUserById(context.env.DB, refreshData.userId);
      if (dbUser) {
        if (!dbUser.data_key) {
          dataKey = generateDataKey();
          await updateUserDataKey(context.env.DB, dbUser.id, dataKey);
        } else {
          dataKey = dbUser.data_key;
        }
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
    return jsonResponse({
      success: true,
      message: t('auth.refresh.success', '令牌刷新成功'),
      user: {
        id: refreshData.userId,
        username: refreshData.username,
        email: refreshData.email,
        role: refreshData.role ?? 'user',
        dataKey,
      },
    }, 200, {
      'Set-Cookie': [
        serializeCookie('auth_token', accessToken, { ...cookieOptions, maxAge: getAccessTokenCookieMaxAge(refreshData.role ?? 'user') }),
        serializeCookie('auth_refresh_token', newRefreshToken, { ...cookieOptions, maxAge: getRefreshTokenCookieMaxAge() }),
      ].join(', '),
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return errorResponse(t('auth.refresh.error', '刷新令牌失败，请稍后重试'), 500);
  }
};
