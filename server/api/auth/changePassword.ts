import { hashPassword, verifyPassword } from '../../utils/crypto';
import { verifyToken, revokeAllUserTokens } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { checkRateLimit } from '../../utils/rateLimit';
import { findUserById, updateUserPassword } from '../../dao/user.dao';
import { getLogger } from '../../utils/logger';
import type { AppContext } from '../../utils/handler';
import { changePasswordSchema } from '../../../shared/schemas';
import { t } from '../../../shared/i18n/server';
const logger = getLogger('ChangePassword')

export const onRequestPost = async (context: AppContext) => {
  try {
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    if (!tokenData) {
      return errorResponse(t('settings.errors.sessionExpired'), 401);
    }

    const rateLimit = await checkRateLimit({
      env: context.env,
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

    const isPasswordValid = await verifyPassword(currentPassword, dbUser.password_hash);

    if (!isPasswordValid) {
      return errorResponse(t('settings.errors.currentPasswordIncorrect'), 400);
    }

    const newPasswordHash = await hashPassword(newPassword);
    await updateUserPassword(context.env.DB, userId, newPasswordHash);

    await revokeAllUserTokens(context.env.AUTH_TOKENS, userId);

    return jsonResponse({
      success: true,
      message: t('settings.messages.passwordSuccess'),
      requireReLogin: true,
    }, 200);
  } catch (error) {
    logger.error('Change password error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('settings.errors.changeFailed'), 500);
  }
};
