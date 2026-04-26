import { jsonResponse, errorResponse } from '../../utils/response';
import { findUserById } from '../../dao/user.dao';
import { verifyToken } from '../../utils/auth';
import type { AppContext } from '../../utils/handler';
import i18n from '../../../src/i18n';

const t = i18n.t.bind(i18n);

export const onRequestGet = async (context: AppContext) => {
  try {
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    if (!tokenData) {
      return errorResponse(t('auth.errors.tokenExpired', '令牌已过期或无效'), 401);
    }

    let avatar: string | undefined;
    let email = tokenData.email;
    let dataKey: string | undefined = tokenData.dataKey;

    try {
      // 从 D1 获取完整用户信息
      const dbUser = await findUserById(context.env.DB, tokenData.userId);
      if (dbUser) {
        avatar = dbUser.avatar ?? undefined;
        email = dbUser.email;
        dataKey = dbUser.data_key ?? undefined;
      }
    } catch (dbError) {
      console.warn('Token verification fallback to token payload:', dbError);
    }

    return jsonResponse({
      success: true,
      user: {
        id: tokenData.userId,
        username: tokenData.username,
        email,
        avatar,
        role: tokenData.role ?? 'user',
        dataKey,
      },
    }, 200);
  } catch (error) {
    console.error('Token verification error:', error);
    return errorResponse(t('auth.errors.verifyFailed', '验证失败，请稍后重试'), 500);
  }
};
