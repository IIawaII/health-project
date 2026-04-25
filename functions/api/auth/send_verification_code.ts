import { jsonResponse, errorResponse } from '../../lib/response';
import { verifyToken } from '../../lib/auth';
import { validateTurnstile } from '../../lib/turnstile';
import { checkRateLimit } from '../../lib/rateLimit';
import {
  emailExists,
  findUserById,
  upsertVerificationCode,
  deleteVerificationCode,
  checkVerificationCooldown,
  setVerificationCooldown,
  deleteVerificationCooldown,
} from '../../lib/db';
import type { Env } from '../../lib/env';

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
  // 逐位取模 10 生成 0-9 的数字，在 256 与 10 不互质时存在极微小偏差，
  // 但对于 6 位验证码场景完全可接受，远优于单次大范围模运算
  return Array.from(digits, (b) => (b % 10).toString()).join('')
}

async function sendEmailViaResend(apiKey: string, to: string, code: string, type: string): Promise<void> {
  const subject = type === 'register' ? 'Health Project - 注册验证码' : 'Health Project - 修改邮箱验证码';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #3b82f6;">Health Project</h2>
      <p>您的验证码为：</p>
      <div style="font-size: 32px; font-weight: bold; color: #3b82f6; letter-spacing: 4px; margin: 20px 0; padding: 15px; background: #f0f9ff; border-radius: 8px; text-align: center;">
        ${code}
      </div>
      <p>验证码有效期为 <strong>3 分钟</strong>，请勿泄露给他人。</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">如非本人操作，请忽略此邮件。</p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Health Project <noreply@resend.dev>',
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
  }
}

export const onRequestPost = async (context: EventContext<Env, string, Record<string, unknown>>) => {
  try {
    const body = await context.request.json<SendCodeRequest>();
    const { email, type, turnstileToken, currentEmail } = body;

    // 验证输入
    if (!email || !type) {
      return errorResponse('请填写所有必填字段', 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('请输入有效的邮箱地址', 400);
    }

    if (type !== 'register' && type !== 'update_email') {
      return errorResponse('无效的验证码类型', 400);
    }

    // 认证方式：注册使用 Turnstile，修改邮箱使用 Bearer Token
    if (type === 'register') {
      if (!turnstileToken) {
        return errorResponse('请完成人机验证', 400);
      }
      const turnstileError = await validateTurnstile(context, turnstileToken);
      if (turnstileError) return errorResponse(turnstileError, 400);
    } else if (type === 'update_email') {
      // 验证 Bearer Token（复用 lib/auth 中的逻辑）
      const tokenData = await verifyToken(context);
      if (!tokenData) {
        return errorResponse('登录已过期', 401);
      }
      // 校验 currentEmail 是否属于当前登录用户
      const dbUser = await findUserById(context.env.DB, tokenData.userId);
      if (!dbUser || dbUser.email !== currentEmail) {
        return errorResponse('当前邮箱信息不匹配', 403);
      }
    }

    // IP 级别速率限制：每个 IP 每小时最多发送 10 次验证码（防止多邮箱滥发）
    const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipRateLimit = await checkRateLimit({
      kv: context.env.VERIFICATION_CODES,
      key: `ip:${clientIP}:send_code`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!ipRateLimit.allowed) {
      return errorResponse('发送过于频繁，请稍后再试', 429);
    }

    // 检查发送频率限制（60秒冷却）—— 使用 D1 替代 KV，保证与验证码数据一致性
    const cooldownCheck = await checkVerificationCooldown(context.env.DB, type, email, SEND_CODE_COOLDOWN_SECONDS);
    if (!cooldownCheck.allowed) {
      return errorResponse(`发送过于频繁，请 ${cooldownCheck.remainingSeconds} 秒后再试`, 429);
    }

    // 注册类型：检查邮箱是否已被注册
    if (type === 'register') {
      const exists = await emailExists(context.env.DB, email);
      if (exists) {
        return errorResponse('该邮箱已被注册', 409);
      }
    }

    // 修改邮箱类型：检查新邮箱是否已被使用（排除当前用户自己的邮箱）
    if (type === 'update_email') {
      const exists = await emailExists(context.env.DB, email);
      if (exists) {
        return errorResponse('该邮箱已被使用', 409);
      }
      if (!currentEmail) {
        return errorResponse('缺少当前邮箱信息', 400);
      }
      if (currentEmail === email) {
        return errorResponse('新邮箱不能与当前邮箱相同', 400);
      }
    }

    // 检查是否已配置邮件服务
    if (!context.env.RESEND_API_KEY) {
      return errorResponse('邮件服务未配置，请联系管理员', 500);
    }

    // 生成验证码
    const code = generateCode();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_SECONDS * 1000).toISOString();
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

      // 使用 D1 存储冷却时间，与验证码在同一数据库保证一致性
      await setVerificationCooldown(context.env.DB, type, email);
      cooldownPersisted = true;

      await sendEmailViaResend(context.env.RESEND_API_KEY, email, code, type);
    } catch (sendError) {
      const rollbackTasks: Promise<unknown>[] = [];
      if (codePersisted) {
        rollbackTasks.push(deleteVerificationCode(context.env.DB, type, email));
      }
      if (cooldownPersisted) {
        rollbackTasks.push(deleteVerificationCooldown(context.env.DB, type, email));
      }
      await Promise.allSettled(rollbackTasks);
      throw sendError;
    }

    return jsonResponse({
      success: true,
      message: '验证码已发送',
    }, 200);
  } catch (error) {
    console.error('Send verification code error:', error);
    return errorResponse('发送验证码失败，请稍后重试', 500);
  }
};
