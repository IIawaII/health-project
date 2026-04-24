import { hashPassword, verifyPassword } from '../../lib/crypto';
import { verifyToken, revokeAllUserTokens } from '../../lib/auth';
import { jsonResponse, errorResponse } from '../../lib/response';

interface Env {
  USERS: KVNamespace;
  AUTH_TOKENS: KVNamespace;
}

export const onRequestPost = async (context: EventContext<Env, string, Record<string, unknown>>) => {
  try {
    // 验证 token（复用 lib/auth 中的逻辑）
    const tokenData = await verifyToken(context);
    if (!tokenData) {
      return errorResponse('登录已过期', 401);
    }

    const userId = tokenData.userId;
    const userData = await context.env.USERS.get(`user:${userId}`);

    if (!userData) {
      return errorResponse('用户不存在', 404);
    }

    const user = JSON.parse(userData);
    const body = await context.request.json<{ currentPassword: string; newPassword: string }>();

    if (!body.currentPassword || !body.newPassword) {
      return errorResponse('请填写完整信息', 400);
    }

    if (body.newPassword.length < 6) {
      return errorResponse('新密码至少6位', 400);
    }

    // 验证当前密码
    const isPasswordValid = await verifyPassword(body.currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      return errorResponse('当前密码不正确', 400);
    }

    // 哈希新密码并更新
    user.passwordHash = await hashPassword(body.newPassword);
    user.updatedAt = new Date().toISOString();
    await context.env.USERS.put(`user:${userId}`, JSON.stringify(user));

    // 修改密码后使该用户的所有 token 失效（强制重新登录）
    await revokeAllUserTokens(context.env.AUTH_TOKENS, userId);

    return jsonResponse({
      success: true,
      message: '密码修改成功，请使用新密码重新登录',
    }, 200);
  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse('修改失败，请稍后重试', 500);
  }
};
