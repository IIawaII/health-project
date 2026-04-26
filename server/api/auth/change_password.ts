import { hashPassword, verifyPassword } from '../../utils/crypto';
import { verifyToken, revokeAllUserTokens } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { checkRateLimit } from '../../utils/rateLimit';
import { findUserById, updateUserPassword } from '../../dao/user.dao';
import type { AppContext } from '../../utils/handler';
import { changePasswordSchema } from '../../../shared/schemas';

export const onRequestPost = async (context: AppContext) => {
  try {
    // 验证 token（复用 lib/auth 中的逻辑）
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    if (!tokenData) {
      return errorResponse('登录已过期', 401);
    }

    // 速率限制：每个用户每小时最多 5 次修改密码尝试
    const rateLimit = await checkRateLimit({
      kv: context.env.AUTH_TOKENS,
      key: `${tokenData.userId}:change_password`,
      limit: 5,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      return errorResponse('修改密码尝试过于频繁，请稍后再试', 429);
    }

    const userId = tokenData.userId;
    const dbUser = await findUserById(context.env.DB, userId);

    if (!dbUser) {
      return errorResponse('用户不存在', 404);
    }

    const body = await context.req.json<unknown>();
    const parseResult = changePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || '请求参数错误';
      return errorResponse(firstError, 400);
    }
    const { currentPassword, newPassword } = parseResult.data;

    // 验证当前密码
    const isPasswordValid = await verifyPassword(currentPassword, dbUser.password_hash);

    if (!isPasswordValid) {
      return errorResponse('当前密码不正确', 400);
    }

    // 哈希新密码并更新
    const newPasswordHash = await hashPassword(newPassword);
    await updateUserPassword(context.env.DB, userId, newPasswordHash);

    // 修改密码后使该用户的所有 token 失效（强制重新登录）
    await revokeAllUserTokens(context.env.AUTH_TOKENS, userId);

    return jsonResponse({
      success: true,
      message: '密码修改成功，请使用新密码重新登录',
      requireReLogin: true,
    }, 200);
  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse('修改失败，请稍后重试', 500);
  }
};
