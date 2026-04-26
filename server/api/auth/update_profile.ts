import { verifyToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { findUserById, updateUser, usernameExists, emailExists } from '../../dao/user.dao';
import { consumeVerificationCode } from '../../dao/verification.dao';
import type { AppContext } from '../../utils/handler';

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export const onRequestPost = async (context: AppContext) => {
  try {
    // 验证 token（复用 lib/auth 中的逻辑）
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    if (!tokenData) {
      return errorResponse('登录已过期', 401);
    }

    const userId = tokenData.userId;

    // 从 D1 获取用户数据
    const dbUser = await findUserById(context.env.DB, userId);

    if (!dbUser) {
      return errorResponse('用户不存在', 404);
    }

    const body = await context.req.json<{ username?: string; email?: string; avatar?: string; verificationCode?: string }>();

    const updates: { username?: string; email?: string; avatar?: string } = {};

    // 更新用户名
    if (body.username && body.username !== dbUser.username) {
      // 验证用户名格式
      if (!/^[a-zA-Z0-9_]{3,10}$/.test(body.username)) {
        return errorResponse('用户名只能包含字母、数字和下划线，长度3-10位', 400);
      }
      // 检查新用户名是否已被使用
      const exists = await usernameExists(context.env.DB, body.username, userId);
      if (exists) {
        return errorResponse('该用户名已被使用', 400);
      }
      updates.username = body.username;
    }

    // 更新邮箱
    if (body.email && body.email !== dbUser.email) {
      // 验证验证码
      if (!body.verificationCode) {
        return errorResponse('请输入验证码', 400);
      }

      // 先检查新邮箱是否已被使用，避免无谓消耗验证码
      const exists = await emailExists(context.env.DB, body.email, userId);
      if (exists) {
        return errorResponse('该邮箱已被使用', 400);
      }

      const verificationStatus = await consumeVerificationCode(
        context.env.DB,
        'update_email',
        body.email,
        body.verificationCode,
        Math.floor(Date.now() / 1000)
      );
      if (verificationStatus === 'expired') {
        return errorResponse('验证码已过期，请重新获取', 400);
      }
      if (verificationStatus === 'not_found') {
        return errorResponse('验证码不存在，请重新获取', 400);
      }
      if (verificationStatus === 'invalid') {
        return errorResponse('验证码错误', 400);
      }

      updates.email = body.email;
    }

    // 更新头像（独立于邮箱更新，避免同时更新时头像丢失）
    if (body.avatar !== undefined) {
      const MAX_AVATAR_SIZE = 100 * 1024 * 4 / 3; // base64 约 133KB 对应 100KB 原始数据
      if (body.avatar.length > MAX_AVATAR_SIZE) {
        return errorResponse('头像过大，请压缩后重试', 400);
      }
      // 拒绝非图片 data URL，防止 XSS
      if (body.avatar && !body.avatar.startsWith('data:image/')) {
        return errorResponse('头像格式不合法', 400);
      }
      updates.avatar = body.avatar;
    }

    // 执行更新
    if (Object.keys(updates).length > 0) {
      try {
        await updateUser(context.env.DB, userId, updates);
      } catch (dbError) {
        if (isUniqueConstraintError(dbError)) {
          return errorResponse('用户名或邮箱已被使用', 409);
        }
        throw dbError;
      }
    }

    return jsonResponse({
      success: true,
      message: '更新成功',
      user: {
        id: userId,
        username: updates.username ?? dbUser.username,
        email: updates.email ?? dbUser.email,
        avatar: updates.avatar ?? (dbUser.avatar ?? undefined),
      },
    }, 200);
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse('更新失败，请稍后重试', 500);
  }
};
