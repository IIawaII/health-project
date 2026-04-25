import { z } from 'zod';
import { verifyPassword, generateToken } from '../../lib/crypto';
import { saveToken, saveRefreshToken } from '../../lib/auth';
import { jsonResponse, errorResponse } from '../../lib/response';
import { validateTurnstile } from '../../lib/turnstile';
import { checkRateLimit } from '../../lib/rateLimit';
import { findUserByUsername, findUserByEmail } from '../../lib/db';
import type { Env } from '../../lib/env';

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, '请填写用户名或邮箱').max(254, '输入过长'),
  password: z.string().min(1, '请填写密码').max(128, '密码长度不能超过128位'),
  turnstileToken: z.string().min(1, '请完成人机验证'),
});

export const onRequestPost = async (context: EventContext<Env, string, Record<string, unknown>>) => {
  try {
    const body = await context.request.json<unknown>();
    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || '请求参数错误';
      return errorResponse(firstError, 400);
    }
    const { usernameOrEmail, password, turnstileToken } = parseResult.data;

    // 验证 Turnstile
    const turnstileError = await validateTurnstile(context, turnstileToken);
    if (turnstileError) return errorResponse(turnstileError, 400);

    // 速率限制：每个 IP 每分钟最多 10 次登录尝试
    const rateIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimit = await checkRateLimit({
      kv: context.env.AUTH_TOKENS,
      key: `${rateIP}:login`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return errorResponse('登录尝试过于频繁，请稍后再试', 429);
    }

    // 判断是用户名还是邮箱，直接从 D1 查询用户
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usernameOrEmail);
    const user = isEmail
      ? await findUserByEmail(context.env.DB, usernameOrEmail)
      : await findUserByUsername(context.env.DB, usernameOrEmail);

    if (!user) {
      return errorResponse('用户名或密码错误', 401);
    }

    // 验证密码
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return errorResponse('用户名或密码错误', 401);
    }

    // 生成 Access Token 和 Refresh Token
    const accessToken = generateToken();
    const refreshToken = generateToken();
    const now = new Date().toISOString();

    // 保存 Access Token（15分钟有效期）
    await saveToken(context.env.AUTH_TOKENS, accessToken, {
      userId: user.id,
      username: user.username,
      email: user.email,
      createdAt: now,
    });

    // 保存 Refresh Token（30天有效期）
    await saveRefreshToken(context.env.AUTH_TOKENS, refreshToken, {
      userId: user.id,
      username: user.username,
      email: user.email,
      createdAt: now,
    });

    return jsonResponse({
      success: true,
      message: '登录成功',
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar ?? undefined,
      },
    }, 200);
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('登录失败，请稍后重试', 500);
  }
};
