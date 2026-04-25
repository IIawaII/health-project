import { z } from 'zod';
import { hashPassword, generateToken } from '../../lib/crypto';
import { saveToken, saveRefreshToken } from '../../lib/auth';
import { jsonResponse, errorResponse } from '../../lib/response';
import { validateTurnstile } from '../../lib/turnstile';
import { checkRateLimit, buildRateLimitKey } from '../../lib/rateLimit';
import { findUserByUsername, findUserByEmail, createUser, consumeVerificationCode } from '../../lib/db';
import type { Env } from '../../lib/env';

const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,10}$/, '用户名只能包含字母、数字和下划线，长度3-10位'),
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码长度至少8位').max(128, '密码长度不能超过128位').regex(/(?=.*[A-Za-z])(?=.*\d)/, '密码必须同时包含字母和数字'),
  turnstileToken: z.string().min(1, '请完成人机验证'),
  verificationCode: z.string().regex(/^\d{6}$/, '请输入6位数字验证码'),
});

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export const onRequestPost = async (context: EventContext<Env, string, Record<string, unknown>>) => {
  try {
    // 速率限制：每个 IP 每分钟最多 5 次注册尝试
    const rateLimit = await checkRateLimit({
      kv: context.env.AUTH_TOKENS,
      key: buildRateLimitKey(context, 'register'),
      limit: 5,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return errorResponse('注册尝试过于频繁，请稍后再试', 429);
    }

    const body = await context.request.json<unknown>();
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || '请求参数错误';
      return errorResponse(firstError, 400);
    }
    const { username, email, password, turnstileToken, verificationCode } = parseResult.data;

    // 验证 Turnstile
    const turnstileError = await validateTurnstile(context, turnstileToken);
    if (turnstileError) return errorResponse(turnstileError, 400);

    // 先做用户唯一性检查，避免无谓消耗验证码
    const existingUserByUsername = await findUserByUsername(context.env.DB, username);
    if (existingUserByUsername) {
      return errorResponse('用户名已被注册', 409);
    }

    const existingUserByEmail = await findUserByEmail(context.env.DB, email);
    if (existingUserByEmail) {
      return errorResponse('邮箱已被注册', 409);
    }

    // 原子消费邮箱验证码，避免并发重复注册
    const verificationStatus = await consumeVerificationCode(
      context.env.DB,
      'register',
      email,
      verificationCode,
      new Date().toISOString()
    );
    if (verificationStatus === 'expired' || verificationStatus === 'not_found') {
      return errorResponse('验证码已过期或不存在，请重新获取', 400);
    }
    if (verificationStatus === 'invalid') {
      return errorResponse('验证码错误', 400);
    }

    // 创建用户
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    try {
      await createUser(context.env.DB, {
        id: userId,
        username,
        email,
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      });
    } catch (dbError) {
      console.error('Registration D1 write failed:', dbError);
      if (isUniqueConstraintError(dbError)) {
        return errorResponse('用户名或邮箱已被注册', 409);
      }
      return errorResponse('注册失败，数据写入异常，请稍后重试', 500);
    }

    // 生成 Access Token 和 Refresh Token
    const accessToken = generateToken();
    const refreshToken = generateToken();

    try {
      // 保存 Access Token（15分钟有效期）
      await saveToken(context.env.AUTH_TOKENS, accessToken, {
        userId,
        username,
        email,
        createdAt: now,
      });

      // 保存 Refresh Token（30天有效期）
      await saveRefreshToken(context.env.AUTH_TOKENS, refreshToken, {
        userId,
        username,
        email,
        createdAt: now,
      });
    } catch (tokenError) {
      console.error('Registration token write failed:', tokenError);
      // KV 写入失败时，用户已创建但无令牌。告知用户尝试直接登录，
      // 由登录流程重新颁发令牌（D1 与 KV 无分布式事务）。
      return errorResponse(
        '注册成功但自动登录失败，请使用刚注册的账号直接登录',
        503
      );
    }

    return jsonResponse({
      success: true,
      message: '注册成功',
      token: accessToken,
      refreshToken,
      user: {
        id: userId,
        username,
        email,
      },
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse('注册失败，请稍后重试', 500);
  }
};
