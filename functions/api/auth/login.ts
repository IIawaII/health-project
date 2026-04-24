import { verifyPassword, generateToken } from '../../lib/crypto';
import { saveToken } from '../../lib/auth';
import { jsonResponse, errorResponse } from '../../lib/response';

interface LoginRequest {
  usernameOrEmail: string;
  password: string;
  turnstileToken: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  avatar?: string;
}

async function verifyTurnstile(token: string, secretKey: string, ip?: string): Promise<boolean> {
  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (ip) {
    formData.append('remoteip', ip);
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json<{ success: boolean }>();
    return data.success;
  } catch {
    return false;
  }
}

export const onRequestPost = async (context: EventContext<{ TURNSTILE_SECRET_KEY: string; USERS: KVNamespace; AUTH_TOKENS: KVNamespace }, string, Record<string, unknown>>) => {
  try {
    const body = await context.request.json<LoginRequest>();
    const { usernameOrEmail, password, turnstileToken } = body;

    // 验证输入
    if (!usernameOrEmail || !password || !turnstileToken) {
      return errorResponse('请填写所有必填字段', 400);
    }

    // 验证 Turnstile
    const clientIP = context.request.headers.get('CF-Connecting-IP') || undefined;
    const isValid = await verifyTurnstile(
      turnstileToken,
      context.env.TURNSTILE_SECRET_KEY,
      clientIP || undefined
    );

    if (!isValid) {
      return errorResponse('人机验证失败，请重试', 400);
    }

    // 判断是用户名还是邮箱
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usernameOrEmail);
    let userId: string | null = null;

    if (isEmail) {
      userId = await context.env.USERS.get(`email:${usernameOrEmail}`);
    } else {
      userId = await context.env.USERS.get(`username:${usernameOrEmail}`);
    }

    if (!userId) {
      return errorResponse('用户名或密码错误', 401);
    }

    // 获取用户信息
    const userData = await context.env.USERS.get(`user:${userId}`);
    if (!userData) {
      return errorResponse('用户不存在', 404);
    }

    const user: User = JSON.parse(userData);

    // 验证密码
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return errorResponse('用户名或密码错误', 401);
    }

    // 生成登录令牌
    const token = generateToken();
    const now = new Date().toISOString();

    // 保存令牌（7天有效期）并建立用户索引
    await saveToken(context.env.AUTH_TOKENS, token, {
      userId: user.id,
      username: user.username,
      email: user.email,
      createdAt: now,
    }, 7 * 24 * 60 * 60);

    return jsonResponse({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      },
    }, 200);
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('登录失败，请稍后重试', 500);
  }
};
