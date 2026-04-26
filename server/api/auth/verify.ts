import { jsonResponse, errorResponse } from '../../utils/response';
import { findUserById, updateUserDataKey } from '../../dao/user.dao';
import { verifyToken } from '../../utils/auth';
import { generateDataKey } from '../../utils/crypto';
import type { AppContext } from '../../utils/handler';

export const onRequestGet = async (context: AppContext) => {
  try {
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    if (!tokenData) {
      return errorResponse('令牌已过期或无效', 401);
    }

    let avatar: string | undefined;
    let email = tokenData.email;
    let dataKey: string | undefined = tokenData.dataKey;

    try {
      // 从 D1 获取完整用户信息（包括头像、最新邮箱和数据密钥）
      const dbUser = await findUserById(context.env.DB, tokenData.userId);
      if (dbUser) {
        avatar = dbUser.avatar ?? undefined;
        email = dbUser.email;
        // 为没有 data_key 的老用户自动生成并持久化
        if (!dbUser.data_key) {
          dataKey = generateDataKey();
          await updateUserDataKey(context.env.DB, dbUser.id, dataKey);
        } else {
          dataKey = dbUser.data_key;
        }
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
    return errorResponse('验证失败，请稍后重试', 500);
  }
};
