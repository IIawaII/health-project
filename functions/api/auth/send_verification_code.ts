import { jsonResponse, errorResponse } from '../../lib/response';

interface SendCodeRequest {
  email: string;
  type: 'register' | 'update_email';
  turnstileToken?: string;
  currentEmail?: string;
}

interface Env {
  USERS: KVNamespace;
  AUTH_TOKENS: KVNamespace;
  VERIFICATION_CODES: KVNamespace;
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
}

async function verifyTurnstile(token: string, secretKey: string, ip?: string): Promise<boolean> {
  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (ip) {
    formData.append('remoteip', ip);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const data = await response.json<{ success: boolean }>();
  return data.success;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
      <p>验证码有效期为 <strong>5 分钟</strong>，请勿泄露给他人。</p>
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
      const clientIP = context.request.headers.get('CF-Connecting-IP') || undefined;
      const isValid = await verifyTurnstile(
        turnstileToken,
        context.env.TURNSTILE_SECRET_KEY,
        clientIP || undefined
      );
      if (!isValid) {
        return errorResponse('人机验证失败，请重试', 400);
      }
    } else if (type === 'update_email') {
      // 验证 Bearer Token
      const authHeader = context.request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse('未登录', 401);
      }
      const token = authHeader.substring(7);
      const tokenDataStr = await context.env.AUTH_TOKENS.get(`token:${token}`);
      if (!tokenDataStr) {
        return errorResponse('登录已过期', 401);
      }
    }

    // 检查发送频率限制（60秒冷却）
    const rateLimitKey = `rate_limit:${type}:${email}`;
    const lastSent = await context.env.VERIFICATION_CODES.get(rateLimitKey);
    if (lastSent) {
      return errorResponse('发送过于频繁，请稍后再试', 429);
    }

    // 注册类型：检查邮箱是否已被注册
    if (type === 'register') {
      const existingUser = await context.env.USERS.get(`email:${email}`);
      if (existingUser) {
        return errorResponse('该邮箱已被注册', 409);
      }
    }

    // 修改邮箱类型：检查新邮箱是否已被使用（排除当前用户自己的邮箱）
    if (type === 'update_email') {
      const existingUser = await context.env.USERS.get(`email:${email}`);
      if (existingUser) {
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
    const codeKey = `verify_code:${type}:${email}`;
    const now = Date.now();

    // 存储验证码（5分钟有效期）
    await context.env.VERIFICATION_CODES.put(codeKey, JSON.stringify({ code, createdAt: now }), {
      expirationTtl: 300,
    });

    // 设置发送频率限制（60秒）
    await context.env.VERIFICATION_CODES.put(rateLimitKey, '1', {
      expirationTtl: 60,
    });

    // 发送邮件
    await sendEmailViaResend(context.env.RESEND_API_KEY, email, code, type);

    return jsonResponse({
      success: true,
      message: '验证码已发送',
    }, 200);
  } catch (error) {
    console.error('Send verification code error:', error);
    return errorResponse('发送验证码失败，请稍后重试', 500);
  }
};
