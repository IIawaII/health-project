import { verifyToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { findUserById, updateUser, usernameExists, emailExists } from '../../dao/user.dao';
import { consumeVerificationCode } from '../../dao/verification.dao';
import type { AppContext } from '../../utils/handler';
import i18n from '../../../src/i18n';

const t = i18n.t.bind(i18n);

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export const onRequestPost = async (context: AppContext) => {
  try {
    // 验证 token
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    if (!tokenData) {
      return errorResponse(t('settings.errors.sessionExpired', '登录已过期'), 401);
    }

    const userId = tokenData.userId;

    // 从 D1 获取用户数据
    const dbUser = await findUserById(context.env.DB, userId);

    if (!dbUser) {
      return errorResponse(t('settings.errors.userNotFound', '用户不存在'), 404);
    }

    const body = await context.req.json<{ username?: string; email?: string; avatar?: string; verificationCode?: string }>();

    const updates: { username?: string; email?: string; avatar?: string } = {};

    // 更新用户名
    if (body.username && body.username !== dbUser.username) {
      // 验证用户名格式
      if (!/^[a-zA-Z0-9_]{3,10}$/.test(body.username)) {
        return errorResponse(t('settings.errors.invalidUsername', '用户名只能包含字母、数字和下划线，长度3-10位'), 400);
      }
      // 检查新用户名是否已被使用
      const exists = await usernameExists(context.env.DB, body.username, userId);
      if (exists) {
        return errorResponse(t('settings.errors.usernameTaken', '该用户名已被使用'), 400);
      }
      updates.username = body.username;
    }

    // 更新邮箱
    if (body.email && body.email !== dbUser.email) {
      // 验证验证码
      if (!body.verificationCode) {
        return errorResponse(t('settings.errors.needCode', '请输入验证码'), 400);
      }

      // 先检查新邮箱是否已被使用，避免无谓消耗验证码
      const exists = await emailExists(context.env.DB, body.email, userId);
      if (exists) {
        return errorResponse(t('settings.errors.emailTaken', '该邮箱已被使用'), 400);
      }

      const verificationStatus = await consumeVerificationCode(
        context.env.DB,
        'update_email',
        body.email,
        body.verificationCode,
        Math.floor(Date.now() / 1000)
      );
      if (verificationStatus === 'expired') {
        return errorResponse(t('settings.errors.codeExpired', '验证码已过期，请重新获取'), 400);
      }
      if (verificationStatus === 'not_found') {
        return errorResponse(t('settings.errors.codeNotFound', '验证码不存在，请重新获取'), 400);
      }
      if (verificationStatus === 'invalid') {
        return errorResponse(t('settings.errors.codeInvalid', '验证码错误'), 400);
      }

      updates.email = body.email;
    }

    // 更新头像
    if (body.avatar !== undefined) {
      if (body.avatar === '') {
        return errorResponse(t('settings.errors.avatarRequired', '请先选择头像'), 400);
      }
      else if (/^User_\d+$/.test(body.avatar)) {
        updates.avatar = body.avatar;
      }
      else {
        return errorResponse(t('settings.errors.invalidAvatar', '头像格式不合法'), 400);
      }
    }

    // 执行更新
    if (Object.keys(updates).length > 0) {
      try {
        await updateUser(context.env.DB, userId, updates);
      } catch (dbError) {
        if (isUniqueConstraintError(dbError)) {
          return errorResponse(t('settings.errors.alreadyExists', '用户名或邮箱已被使用'), 409);
        }
        throw dbError;
      }
    }

    return jsonResponse({
      success: true,
      message: t('settings.messages.updateSuccess', '更新成功'),
      user: {
        id: userId,
        username: updates.username ?? dbUser.username,
        email: updates.email ?? dbUser.email,
        avatar: updates.avatar ?? (dbUser.avatar ?? undefined),
      },
    }, 200);
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse(t('settings.errors.updateFailed', '更新失败，请稍后重试'), 500);
  }
};
