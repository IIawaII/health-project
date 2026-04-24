import type { PagesFunction } from '@cloudflare/workers-types';
import { hashPassword, generateToken } from '../../lib/crypto';
import { saveToken } from '../../lib/auth';

interface RegisterRequest {
  username: string;
  email: string;
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

  const data = await response.json() as { success: boolean };
  return data.success;
}

export const onRequestPost = async (context: EventContext<{ TURNSTILE_SECRET_KEY: string; USERS: KVNamespace; AUTH_TOKENS: KVNamespace }, string, Record<string, unknown>>) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  try {
    const body = await context.request.json() as RegisterRequest;
    const { username, email, password, turnstileToken } = body;

    // 验证输入
    if (!username || !email || !password || !turnstileToken) {
      return new Response(
        JSON.stringify({ error: '请填写所有必填字段' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 验证用户名格式
    if (!/^[a-zA-Z0-9_]{3,10}$/.test(username)) {
      return new Response(
        JSON.stringify({ error: '用户名只能包含字母、数字和下划线，长度3-10位' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 验证邮箱格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: '请输入有效的邮箱地址' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 验证密码强度
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: '密码长度至少8位' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 验证 Turnstile
    const clientIP = context.request.headers.get('CF-Connecting-IP') || undefined;
    const isValid = await verifyTurnstile(
      turnstileToken,
      context.env.TURNSTILE_SECRET_KEY,
      clientIP || undefined
    );

    if (!isValid) {
      return new Response(
        JSON.stringify({ error: '人机验证失败，请重试' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 检查用户名是否已存在
    const existingUserByUsername = await context.env.USERS.get(`username:${username}`);
    if (existingUserByUsername) {
      return new Response(
        JSON.stringify({ error: '用户名已被注册' }),
        { status: 409, headers: corsHeaders }
      );
    }

    // 检查邮箱是否已存在
    const existingUserByEmail = await context.env.USERS.get(`email:${email}`);
    if (existingUserByEmail) {
      return new Response(
        JSON.stringify({ error: '邮箱已被注册' }),
        { status: 409, headers: corsHeaders }
      );
    }

    // 创建用户
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    const user: User = {
      id: userId,
      username,
      email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    // 保存用户信息
    await context.env.USERS.put(`user:${userId}`, JSON.stringify(user));
    await context.env.USERS.put(`username:${username}`, userId);
    await context.env.USERS.put(`email:${email}`, userId);

    // 生成登录令牌
    const token = generateToken();

    // 保存令牌（7天有效期）并建立用户索引
    await saveToken(context.env.AUTH_TOKENS, token, {
      userId,
      username,
      email,
      createdAt: now,
    }, 7 * 24 * 60 * 60);

    return new Response(
      JSON.stringify({
        success: true,
        message: '注册成功',
        token,
        user: {
          id: userId,
          username,
          email,
        },
      }),
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return new Response(
      JSON.stringify({ error: '注册失败，请稍后重试' }),
      { status: 500, headers: corsHeaders }
    );
  }
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};
