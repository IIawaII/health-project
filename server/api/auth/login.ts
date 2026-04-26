import { verifyPassword, generateToken, generateDataKey } from '../../utils/crypto';
import { saveToken, saveRefreshToken, ADMIN_ACCESS_TOKEN_TTL, ADMIN_REFRESH_TOKEN_TTL } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { validateTurnstile } from '../../utils/turnstile';
import { checkRateLimit } from '../../utils/rateLimit';
import { findUserByUsername, findUserByEmail, updateUserDataKey } from '../../dao/user.dao';
import { serializeCookie, getSecureCookieOptions, getAccessTokenCookieMaxAge, getRefreshTokenCookieMaxAge } from '../../utils/cookie';
import type { AppContext } from '../../utils/handler';
import { loginSchema, EMAIL_REGEX } from '../../../shared/schemas';
import i18n from '../../../src/i18n';
const t = i18n.t.bind(i18n);

export const onRequestPost = async (context: AppContext) => {
  try {
    const body = await context.req.json<unknown>();
    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || t('auth.errors.invalidRequest', '请求参数错误');
      return errorResponse(firstError, 400);
    }
    const { usernameOrEmail, password, turnstileToken } = parseResult.data;

    // 验证 Turnstile
    const turnstileError = await validateTurnstile(context, turnstileToken);
    if (turnstileError) return errorResponse(turnstileError, 400);

    // 速率限制：每个 IP 每分钟最多 10 次登录尝试
    const rateIP = context.req.header('CF-Connecting-IP') || 'unknown';
    const rateLimit = await checkRateLimit({
      kv: context.env.AUTH_TOKENS,
      key: `${rateIP}:login`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return errorResponse(t('auth.errors.tooManyAttempts'), 429);
    }

    // 优先检查环境变量中的管理员凭据
    const adminUsername = context.env.ADMIN_USERNAME;
    const adminPassword = context.env.ADMIN_PASSWORD;
    if (adminUsername && adminPassword && usernameOrEmail === adminUsername) {
      // 校验密码格式，防止误配明文密码导致验证始终失败
      if (!/^\d+:[a-f0-9]{32}:[a-f0-9]{64}$/i.test(adminPassword)) {
        console.error('[Admin Login] ADMIN_PASSWORD 格式不正确，必须为 PBKDF2 哈希格式（iterations:salt:hash）');
        return errorResponse(t('auth.errors.adminConfigError'), 500);
      }
      const isAdminPasswordValid = await verifyPassword(password, adminPassword);
      if (isAdminPasswordValid) {
        const accessToken = generateToken();
        const refreshToken = generateToken();
        const tokenCreatedAt = new Date().toISOString();

        await saveToken(context.env.AUTH_TOKENS, accessToken, {
          userId: 'system-admin',
          username: adminUsername,
          email: 'admin@system.local',
          role: 'admin',
          createdAt: tokenCreatedAt,
        }, ADMIN_ACCESS_TOKEN_TTL);

        await saveRefreshToken(context.env.AUTH_TOKENS, refreshToken, {
          userId: 'system-admin',
          username: adminUsername,
          email: 'admin@system.local',
          role: 'admin',
          createdAt: tokenCreatedAt,
        }, ADMIN_REFRESH_TOKEN_TTL);

        const cookieOptions = getSecureCookieOptions(context.req.raw);
        return jsonResponse({
          success: true,
          message: t('auth.login.adminSuccess'),
          user: {
            id: 'system-admin',
            username: adminUsername,
            email: 'admin@system.local',
            role: 'admin',
          },
        }, 200, {
          'Set-Cookie': [
            serializeCookie('auth_token', accessToken, { ...cookieOptions, maxAge: getAccessTokenCookieMaxAge('admin') }),
            serializeCookie('auth_refresh_token', refreshToken, { ...cookieOptions, maxAge: getRefreshTokenCookieMaxAge() }),
          ].join(', '),
        });
      }
      return errorResponse(t('auth.login.invalidCredentials'), 401);
    }

    // 判断是用户名还是邮箱，直接从 D1 查询用户
    // 使用与注册一致的邮箱校验逻辑，避免宽松正则误判
    const isEmail = EMAIL_REGEX.test(usernameOrEmail);
    const user = isEmail
      ? await findUserByEmail(context.env.DB, usernameOrEmail)
      : await findUserByUsername(context.env.DB, usernameOrEmail);

    if (!user) {
      return errorResponse(t('auth.login.invalidCredentials'), 401);
    }

    // 验证密码
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return errorResponse(t('auth.login.invalidCredentials'), 401);
    }

    // 为没有 data_key 的老用户自动生成并持久化
    let dataKey = user.data_key;
    if (!dataKey) {
      dataKey = generateDataKey();
      try {
        await updateUserDataKey(context.env.DB, user.id, dataKey);
      } catch (dbError) {
        console.error('[Login] Failed to update data_key:', dbError);
        return errorResponse(t('auth.errors.dataMigrationError'), 500);
      }
    }

    // 生成 Access Token 和 Refresh Token
    const accessToken = generateToken();
    const refreshToken = generateToken();
    const tokenCreatedAt = new Date().toISOString();

    // 保存 Access Token
    await saveToken(context.env.AUTH_TOKENS, accessToken, {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: (user.role as 'user' | 'admin') ?? 'user',
      dataKey,
      createdAt: tokenCreatedAt,
    });

    // 保存 Refresh Token
    await saveRefreshToken(context.env.AUTH_TOKENS, refreshToken, {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: (user.role as 'user' | 'admin') ?? 'user',
      dataKey,
      createdAt: tokenCreatedAt,
    });

    const cookieOptions = getSecureCookieOptions(context.req.raw);
    return jsonResponse({
      success: true,
      message: t('auth.login.success'),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar ?? undefined,
        role: user.role ?? 'user',
        dataKey,
      },
    }, 200, {
      'Set-Cookie': [
        serializeCookie('auth_token', accessToken, { ...cookieOptions, maxAge: getAccessTokenCookieMaxAge(user.role ?? 'user') }),
        serializeCookie('auth_refresh_token', refreshToken, { ...cookieOptions, maxAge: getRefreshTokenCookieMaxAge() }),
      ].join(', '),
    });
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(t('auth.errors.loginFailed'), 500);
  }
};
