import { jsonResponse, errorResponse } from '../../utils/response';
import { verifyToken } from '../../utils/auth';
import { validateTurnstile } from '../../utils/turnstile';
import { checkRateLimit } from '../../utils/rateLimit';
import { emailExists, findUserById } from '../../dao/user.dao';
import {
  upsertVerificationCode,
  deleteVerificationCode,
  checkVerificationCooldown,
  setVerificationCooldown,
  deleteVerificationCooldown,
  cleanupExpiredVerificationCodes,
} from '../../dao/verification.dao';
import { getLogger } from '../../utils/logger';
import { sendEmailViaSMTP } from '../../utils/smtp';
import type { EmailQueueMessage } from '../../queues/types';
import type { AppContext } from '../../utils/handler';
import { t } from '../../../shared/i18n/server';
const logger = getLogger('SendCode')

interface SendCodeRequest {
  email: string;
  type: 'register' | 'update_email';
  turnstileToken?: string;
  currentEmail?: string;
}

const VERIFICATION_CODE_TTL_SECONDS = 180;
const SEND_CODE_COOLDOWN_SECONDS = 60;

function generateCode(): string {
  const digits = new Uint8Array(6)
  crypto.getRandomValues(digits)
  return Array.from(digits, (b) => (b % 10).toString()).join('')
}

class EmailSendError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export const onRequestPost = async (context: AppContext) => {
  try {
    const body = await context.req.json<SendCodeRequest>();
    const { email, type, turnstileToken, currentEmail } = body;

    if (!email || !type) {
      return errorResponse(t('auth.verification.missingFields', '请填写所有必填字段'), 400);
    }

    if (!/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email)) {
      return errorResponse(t('auth.verification.invalidEmail', '请输入有效的邮箱地址'), 400);
    }

    if (type !== 'register' && type !== 'update_email') {
      return errorResponse(t('auth.verification.invalidType', '无效的验证码类型'), 400);
    }

    if (type === 'register') {
      if (!turnstileToken) {
        return errorResponse(t('auth.register.errors.turnstileRequired', '请完成人机验证'), 400);
      }
      const turnstileError = await validateTurnstile(context, turnstileToken);
      if (turnstileError) return errorResponse(turnstileError, 400);
    } else if (type === 'update_email') {
      if (!turnstileToken) {
        return errorResponse(t('auth.register.errors.turnstileRequired', '请完成人机验证'), 400);
      }
      const turnstileError = await validateTurnstile(context, turnstileToken);
      if (turnstileError) return errorResponse(turnstileError, 400);

      const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
      if (!tokenData) {
        return errorResponse(t('settings.errors.sessionExpired', '登录已过期'), 401);
      }
      const dbUser = await findUserById(context.env.DB, tokenData.userId);
      if (!dbUser || dbUser.email !== currentEmail) {
        return errorResponse(t('auth.verification.emailMismatch', '当前邮箱信息不匹配'), 403);
      }
    }

    const clientIP = context.req.header('CF-Connecting-IP') || 'unknown';
    const ipRateLimit = await checkRateLimit({
      env: context.env,
      key: `ip:${clientIP}:send_code`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!ipRateLimit.allowed) {
      return errorResponse(t('auth.verification.tooManyRequests', '发送过于频繁，请稍后再试'), 429);
    }

    const cooldownCheck = await checkVerificationCooldown(context.env.DB, type, email, SEND_CODE_COOLDOWN_SECONDS);
    if (!cooldownCheck.allowed) {
      return errorResponse(t('auth.verification.cooldown', '发送过于频繁，请 {{seconds}} 秒后再试', { seconds: cooldownCheck.remainingSeconds }), 429);
    }

    if (type === 'register') {
      const exists = await emailExists(context.env.DB, email);
      if (exists) {
        return errorResponse(t('auth.register.errors.emailTaken', '该邮箱已被注册'), 409);
      }
    }

    if (type === 'update_email') {
      const exists = await emailExists(context.env.DB, email);
      if (exists) {
        return errorResponse(t('auth.register.errors.emailTaken', '该邮箱已被使用'), 409);
      }
      if (!currentEmail) {
        return errorResponse(t('auth.verification.missingCurrentEmail', '缺少当前邮箱信息'), 400);
      }
      if (currentEmail === email) {
        return errorResponse(t('auth.verification.sameEmail', '新邮箱不能与当前邮箱相同'), 400);
      }
    }

    try {
      await cleanupExpiredVerificationCodes(context.env.DB);
    } catch (err) {
      logger.debug('Failed to cleanup expired verification codes', { error: err instanceof Error ? err.message : String(err) })
    }

    if (!context.env.SMTP_USER || !context.env.SMTP_PASS) {
      return errorResponse(t('auth.verification.emailServiceNotConfigured', '邮件服务未配置，请联系管理员'), 500);
    }

    const code = generateCode();
    const createdAt = Math.floor(Date.now() / 1000);
    const expiresAt = Math.floor(Date.now() / 1000) + VERIFICATION_CODE_TTL_SECONDS;
    let codePersisted = false;
    let cooldownPersisted = false;

    try {
      await upsertVerificationCode(context.env.DB, {
        purpose: type,
        email,
        code,
        createdAt,
        expiresAt,
      });
      codePersisted = true;

      await setVerificationCooldown(context.env.DB, type, email);
      cooldownPersisted = true;

      const subject = type === 'register' ? 'Cloud Health - 注册验证码' : 'Cloud Health - 修改邮箱验证码';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #3b82f6;">Cloud Health</h2>
          <p>您的验证码为：</p>
          <div style="font-size: 32px; font-weight: bold; color: #3b82f6; letter-spacing: 4px; margin: 20px 0; padding: 15px; background: #f0f9ff; border-radius: 8px; text-align: center;">
            ${code}
          </div>
          <p>验证码有效期为 <strong>3 分钟</strong>，请勿泄露给他人。</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">如非本人操作，请忽略此邮件。</p>
        </div>
      `;

      const queueMessage: EmailQueueMessage = {
        type: 'send_email',
        payload: {
          to: email,
          subject,
          html,
        },
      };

      if (context.env.EMAIL_QUEUE && context.env.ENVIRONMENT === 'production') {
        await context.env.EMAIL_QUEUE.send(queueMessage);
        logger.info('Email queued for sending', { email, type });
      } else {
        try {
          const smtpConfig = {
            host: context.env.SMTP_HOST || 'smtp.163.com',
            port: parseInt(context.env.SMTP_PORT || '465', 10),
            user: context.env.SMTP_USER!,
            pass: context.env.SMTP_PASS!,
            fromEmail: context.env.SMTP_USER!,
            fromName: 'Cloud Health',
          };
          await sendEmailViaSMTP(smtpConfig, email, subject, html);
          logger.info('Email sent directly (non-production)', { email, type });
        } catch (smtpErr) {
          logger.warn('SMTP direct send failed in development, skipping email delivery', {
            error: smtpErr instanceof Error ? smtpErr.message : String(smtpErr),
            email,
            hint: 'cloudflare:sockets cannot connect to external TCP in local wrangler dev. Use --remote flag or deploy to test real email delivery.',
          });
        }
      }
    } catch (sendError) {
      if (context.env.ENVIRONMENT !== 'production') {
        logger.warn('Email send failed in development, continuing without email', {
          error: sendError instanceof Error ? sendError.message : String(sendError),
          email,
        });
      } else {
        const rollbackTasks: Promise<unknown>[] = [];
        if (codePersisted) {
          rollbackTasks.push(deleteVerificationCode(context.env.DB, type, email));
        }
        if (cooldownPersisted) {
          rollbackTasks.push(deleteVerificationCooldown(context.env.DB, type, email));
        }
        await Promise.allSettled(rollbackTasks);

        if (sendError instanceof EmailSendError) {
          return errorResponse(sendError.message, sendError.statusCode >= 500 ? 503 : 400);
        }

        logger.error('SMTP send failed', { error: sendError instanceof Error ? sendError.message : String(sendError), email });
        return errorResponse(t('auth.verification.emailSendFailed', '邮件发送失败，请稍后重试'), 503);
      }
    }

    return jsonResponse({
      success: true,
      message: t('auth.verification.codeSent', '验证码已发送'),
    }, 200);
  } catch (error) {
    logger.error('Send verification code error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('auth.verification.sendFailed', '发送验证码失败，请稍后重试'), 500);
  }
};
