import { hashPassword, verifyPassword } from '../../utils/crypto';
import { verifyToken, revokeAllUserTokens } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { checkRateLimit } from '../../utils/rateLimit';
import { findUserById, updateUserPassword } from '../../dao/user.dao';
import type { AppContext } from '../../utils/handler';
import { changePasswordSchema } from '../../../shared/schemas';
import i18n from '../../../src/i18n';

const t = i18n.t.bind(i18n);

export const onRequestPost = async (context: AppContext) => {
  try {
    // 验证 token（复用 lib/auth 中的逻辑）
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    if (!tokenData) {
      return errorResponse(t('settings.errors.sessionExpired'), 401);
    }

    // 速率限制：每个用户每小时最多 5 次修改密码尝试
    const rateLimit = await checkRateLimit({
      kv: context.env.AUTH_TOKENS,
      key: `${tokenData.userId}:change_password`,
      limit: 5,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      return errorResponse(t('settings.errors.tooManyAttempts'), 429);
    }

    const userId = tokenData.userId;
    const dbUser = await findUserById(context.env.DB, userId);

    if (!dbUser) {
      return errorResponse(t('settings.errors.userNotFound'), 404);
    }

    const body = await context.req.json<unknown>();
    const parseResult = changePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || t('settings.errors.invalidRequest');
      return errorResponse(firstError, 400);
    }
    const { currentPassword, newPassword } = parseResult.data;

    // 验证当前密码
    const isPasswordValid = await verifyPassword(currentPassword, dbUser.password_hash);

    if (!isPasswordValid) {
      return errorResponse(t('settings.errors.currentPasswordIncorrect'), 400);
    }

    // 哈希新密码并更新
    const newPasswordHash = await hashPassword(newPassword);
    await updateUserPassword(context.env.DB, userId, newPasswordHash);

    // 修改密码后使该用户的所有 token 失效（强制重新登录）
    await revokeAllUserTokens(context.env.AUTH_TOKENS, userId);

    return jsonResponse({
      success: true,
      message: t('settings.messages.passwordSuccess'),
      requireReLogin: true,
    }, 200);
  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse(t('settings.errors.changeFailed'), 500);
  }
};
