import { jsonResponse, errorResponse } from '../../lib/response';
import { findUserByIdPublic } from '../../lib/db';
import { verifyToken } from '../../lib/auth';
import type { Env } from '../../lib/env';

export const onRequestGet = async (context: EventContext<Env, string, Record<string, unknown>>) => {
  try {
    const tokenData = await verifyToken(context);
    if (!tokenData) {
      return errorResponse('令牌已过期或无效', 401);
    }

    let avatar: string | undefined;
    let email = tokenData.email;

    try {
      // 从 D1 获取完整用户信息（包括头像和最新邮箱）
      const dbUser = await findUserByIdPublic(context.env.DB, tokenData.userId);
      if (dbUser) {
        avatar = dbUser.avatar ?? undefined;
        email = dbUser.email;
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
      },
    }, 200);
  } catch (error) {
    console.error('Token verification error:', error);
    return errorResponse('验证失败，请稍后重试', 500);
  }
};
