import { hashPassword, generateToken, generateDataKey } from '../../utils/crypto';
import { saveToken, saveRefreshToken } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { validateTurnstile } from '../../utils/turnstile';
import { checkRateLimit, buildRateLimitKey } from '../../utils/rateLimit';
import { findUserByUsername, findUserByEmail, createUser } from '../../dao/user.dao';
import { consumeVerificationCode } from '../../dao/verification.dao';
import { getSystemConfig } from '../../dao/config.dao';
import { serializeCookie, getSecureCookieOptions, getAccessTokenCookieMaxAge, getRefreshTokenCookieMaxAge } from '../../utils/cookie';
import type { AppContext } from '../../utils/handler';
import { registerSchema } from '../../../shared/schemas';
import i18n from '../../../src/i18n';

const t = i18n.t.bind(i18n);

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export const onRequestPost = async (context: AppContext) => {
  try {
    // 检查注册功能是否开放
    const registrationConfig = await getSystemConfig(context.env.DB, 'enable_registration');
    if (registrationConfig && registrationConfig.value === 'false') {
      return errorResponse(t('auth.register.registrationClosed', '注册功能已关闭'), 403);
    }

    const body = await context.req.json<unknown>();
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || t('auth.errors.invalidRequest', '请求参数错误');
      return errorResponse(firstError, 400);
    }
    const { username, email, password, turnstileToken, verificationCode } = parseResult.data;

    // 验证 Turnstile（人机验证优先于速率限制，防止机器人无成本消耗配额）
    const turnstileError = await validateTurnstile(context, turnstileToken);
    if (turnstileError) return errorResponse(turnstileError, 400);

    // 速率限制：每个 IP 每分钟最多 5 次注册尝试
    const rateLimit = await checkRateLimit({
      kv: context.env.AUTH_TOKENS,
      key: buildRateLimitKey({ request: context.req.raw }, 'register'),
      limit: 5,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return errorResponse(t('auth.register.errors.tooManyAttempts', '注册尝试过于频繁，请稍后再试'), 429);
    }

    // 先做用户唯一性检查，避免无谓消耗验证码
    // 禁止注册与管理员用户名相同的账号
    if (context.env.ADMIN_USERNAME && username === context.env.ADMIN_USERNAME) {
      return errorResponse(t('auth.register.errors.usernameReserved', '该用户名已被系统保留，请选择其他用户名'), 409);
    }

    const existingUserByUsername = await findUserByUsername(context.env.DB, username);
    if (existingUserByUsername) {
      return errorResponse(t('auth.register.errors.usernameTaken', '用户名已被注册'), 409);
    }

    const existingUserByEmail = await findUserByEmail(context.env.DB, email);
    if (existingUserByEmail) {
      return errorResponse(t('auth.register.errors.emailTaken', '邮箱已被注册'), 409);
    }

    // 原子消费邮箱验证码，避免并发重复注册
    const verificationStatus = await consumeVerificationCode(
      context.env.DB,
      'register',
      email,
      verificationCode,
      Math.floor(Date.now() / 1000)
    );
    if (verificationStatus === 'expired' || verificationStatus === 'not_found') {
      return errorResponse(t('auth.register.errors.codeExpired', '验证码已过期或不存在，请重新获取'), 400);
    }
    if (verificationStatus === 'invalid') {
      return errorResponse(t('auth.register.errors.codeInvalid', '验证码错误'), 400);
    }

    // 创建用户
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const dataKey = generateDataKey();
    const now = Math.floor(Date.now() / 1000);
    try {
      await createUser(context.env.DB, {
        id: userId,
        username,
        email,
        password_hash: passwordHash,
        role: 'user',
        data_key: dataKey,
        created_at: now,
        updated_at: now,
      });
    } catch (dbError) {
      console.error('Registration D1 write failed:', dbError);
      if (isUniqueConstraintError(dbError)) {
        return errorResponse(t('auth.register.errors.alreadyExists', '用户名或邮箱已被注册'), 409);
      }
      return errorResponse(t('auth.register.errors.dbWriteFailed', '注册失败，数据写入异常，请稍后重试'), 500);
    }

    // 生成 Access Token 和 Refresh Token
    const accessToken = generateToken();
    const refreshToken = generateToken();

    try {
      const tokenCreatedAt = new Date().toISOString();
      // 保存 Access Token（15分钟有效期）
      await saveToken(context.env.AUTH_TOKENS, accessToken, {
        userId,
        username,
        email,
        role: 'user',
        dataKey,
        createdAt: tokenCreatedAt,
      });

      // 保存 Refresh Token（30天有效期）
      await saveRefreshToken(context.env.AUTH_TOKENS, refreshToken, {
        userId,
        username,
        email,
        role: 'user',
        dataKey,
        createdAt: tokenCreatedAt,
      });
    } catch (tokenError) {
      console.error('Registration token write failed:', tokenError);
      // KV 写入失败时，用户已创建但无令牌。告知用户尝试直接登录，
      // 由登录流程重新颁发令牌（D1 与 KV 无分布式事务）。
      return errorResponse(
        t('auth.register.errors.autoLoginFailed', '注册成功但自动登录失败，请使用刚注册的账号直接登录'),
        503
      );
    }

    const cookieOptions = getSecureCookieOptions(context.req.raw);
    return jsonResponse({
      success: true,
      message: t('auth.register.success', '注册成功'),
      user: {
        id: userId,
        username,
        email,
        dataKey,
      },
    }, 201, {
      'Set-Cookie': [
        serializeCookie('auth_token', accessToken, { ...cookieOptions, maxAge: getAccessTokenCookieMaxAge('user') }),
        serializeCookie('auth_refresh_token', refreshToken, { ...cookieOptions, maxAge: getRefreshTokenCookieMaxAge() }),
      ].join(', '),
    });
  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse(t('auth.register.errors.registrationFailed', '注册失败，请稍后重试'), 500);
  }
};
