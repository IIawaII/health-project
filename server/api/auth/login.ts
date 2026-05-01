import { verifyPassword, generateToken, generateDataKey } from '../../utils/crypto';
import { saveToken, saveRefreshToken, ADMIN_ACCESS_TOKEN_TTL, ADMIN_REFRESH_TOKEN_TTL } from '../../utils/auth';
import { jsonResponse, errorResponse } from '../../utils/response';
import { validateTurnstile } from '../../utils/turnstile';
import { checkRateLimit } from '../../utils/rateLimit';
import { findUserByUsername, findUserByEmail, findUserById, updateUserDataKey } from '../../dao/user.dao';
import { serializeCookie, getSecureCookieOptions, getAccessTokenCookieMaxAge, getRefreshTokenCookieMaxAge } from '../../utils/cookie';
import { generateCsrfToken, buildCsrfCookie, getCsrfCookieName } from '../../middleware/csrf';
import { getCookie } from '../../utils/cookie';
import { getLogger } from '../../utils/logger';
import { getConfigNumber } from '../../utils/configDefaults';
import type { AppContext } from '../../utils/handler';
import { loginSchema, EMAIL_REGEX } from '../../../shared/schemas';
import { t } from '../../../shared/i18n/server';
const logger = getLogger('Login')

const DEFAULT_MAX_LOGIN_FAILURES = 5
const DEFAULT_ACCOUNT_LOCKOUT_SECONDS = 15 * 60

async function getAccountLockout(kv: KVNamespace, userId: string): Promise<{ locked: boolean; remainingSeconds: number }> {
  const lockoutStr = await kv.get(`account_lockout:${userId}`)
  if (!lockoutStr) return { locked: false, remainingSeconds: 0 }
  const lockoutUntil = parseInt(lockoutStr, 10)
  const now = Date.now()
  if (now < lockoutUntil) {
    return { locked: true, remainingSeconds: Math.ceil((lockoutUntil - now) / 1000) }
  }
  return { locked: false, remainingSeconds: 0 }
}

async function recordLoginFailure(
  kv: KVNamespace,
  userId: string,
  maxFailures: number,
  lockoutSeconds: number
): Promise<void> {
  const failKey = `login_failures:${userId}`
  const currentStr = await kv.get(failKey)
  const current = currentStr ? parseInt(currentStr, 10) : 0
  const newCount = current + 1

  if (newCount >= maxFailures) {
    await kv.put(`account_lockout:${userId}`, String(Date.now() + lockoutSeconds * 1000), {
      expirationTtl: lockoutSeconds,
    })
    await kv.delete(failKey)
  } else {
    await kv.put(failKey, String(newCount), {
      expirationTtl: lockoutSeconds,
    })
  }
}

async function clearLoginFailures(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(`login_failures:${userId}`)
}

export const onRequestPost = async (context: AppContext) => {
  try {
    const body = await context.req.json<unknown>();
    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || t('auth.errors.invalidRequest', '请求参数错误');
      return errorResponse(firstError, 400);
    }
    const { usernameOrEmail, password, turnstileToken } = parseResult.data;

    const turnstileError = await validateTurnstile(context, turnstileToken);
    if (turnstileError) return errorResponse(turnstileError, 400);

    const rateIP = context.req.header('CF-Connecting-IP') || 'unknown';
    const rateLimit = await checkRateLimit({
      env: context.env,
      key: `${rateIP}:login`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return errorResponse(t('auth.errors.tooManyAttempts'), 429);
    }

    const maxLoginFailures = await getConfigNumber(context.env.DB, 'max_login_failures', DEFAULT_MAX_LOGIN_FAILURES)
    const accountLockoutSeconds = await getConfigNumber(context.env.DB, 'account_lockout_seconds', DEFAULT_ACCOUNT_LOCKOUT_SECONDS)

    const adminUsername = context.env.ADMIN_USERNAME;
    const adminPassword = context.env.ADMIN_PASSWORD;

    if (adminUsername && adminPassword && usernameOrEmail === adminUsername) {
      if (!/^\d+:[a-f0-9]{32}:[a-f0-9]{64}$/i.test(adminPassword)) {
        logger.error('ADMIN_PASSWORD format invalid, must be PBKDF2 hash (iterations:salt:hash)');
        return errorResponse(t('auth.errors.adminConfigError'), 500);
      }

      const adminPasswordIterations = parseInt(adminPassword.split(':')[0], 10)
      if (adminPasswordIterations < 100000) {
        logger.error('ADMIN_PASSWORD iterations too low, minimum 100000', { iterations: adminPasswordIterations });
        return errorResponse(t('auth.errors.adminConfigError'), 500);
      }

      const adminLockout = await getAccountLockout(context.env.AUTH_TOKENS, 'system-admin')
      if (adminLockout.locked) {
        return errorResponse(t('auth.login.accountLocked', '账户已被临时锁定，请稍后重试'), 423)
      }

      const isAdminPasswordValid = await verifyPassword(password, adminPassword);
      if (isAdminPasswordValid) {
        await clearLoginFailures(context.env.AUTH_TOKENS, 'system-admin')

        const dbAdmin = await findUserById(context.env.DB, 'system-admin')
        let adminDataKey = dbAdmin?.data_key ?? null
        if (!adminDataKey) {
          adminDataKey = generateDataKey()
          try {
            await updateUserDataKey(context.env.DB, 'system-admin', adminDataKey)
          } catch (dbError) {
            logger.error('Failed to update admin data_key', { error: dbError instanceof Error ? dbError.message : String(dbError) })
          }
        }

        const accessToken = generateToken();
        const refreshToken = generateToken();
        const tokenCreatedAt = new Date().toISOString();

        await saveToken(context.env.AUTH_TOKENS, accessToken, {
          userId: 'system-admin',
          username: adminUsername,
          email: 'admin@system.local',
          role: 'admin',
          dataKey: adminDataKey,
          createdAt: tokenCreatedAt,
        }, ADMIN_ACCESS_TOKEN_TTL);

        await saveRefreshToken(context.env.AUTH_TOKENS, refreshToken, {
          userId: 'system-admin',
          username: adminUsername,
          email: 'admin@system.local',
          role: 'admin',
          dataKey: adminDataKey,
          createdAt: tokenCreatedAt,
        }, ADMIN_REFRESH_TOKEN_TTL);

        const cookieOptions = getSecureCookieOptions(context.req.raw);
        const isSecure = context.req.raw.url.startsWith('https://')
        const existingCsrf = getCookie(context.req.raw, getCsrfCookieName())
        const csrfCookie = existingCsrf ? '' : buildCsrfCookie(generateCsrfToken(), isSecure)
        const cookies = [
          serializeCookie('auth_token', accessToken, { ...cookieOptions, maxAge: getAccessTokenCookieMaxAge('admin') }),
          serializeCookie('auth_refresh_token', refreshToken, { ...cookieOptions, maxAge: getRefreshTokenCookieMaxAge() }),
        ]
        if (csrfCookie) cookies.push(csrfCookie)
        return jsonResponse({
          success: true,
          message: t('auth.login.adminSuccess'),
          user: {
            id: 'system-admin',
            username: adminUsername,
            email: 'admin@system.local',
            role: 'admin',
            dataKey: adminDataKey,
          },
        }, 200, undefined, cookies.map((c) => `Set-Cookie: ${c}`));
      }
      await recordLoginFailure(context.env.AUTH_TOKENS, 'system-admin', maxLoginFailures, accountLockoutSeconds)
      return errorResponse(t('auth.login.invalidCredentials'), 401);
    }

    const isEmail = EMAIL_REGEX.test(usernameOrEmail);
    const user = isEmail
      ? await findUserByEmail(context.env.DB, usernameOrEmail)
      : await findUserByUsername(context.env.DB, usernameOrEmail);

    if (!user) {
      return errorResponse(t('auth.login.invalidCredentials'), 401);
    }

    const lockout = await getAccountLockout(context.env.AUTH_TOKENS, user.id)
    if (lockout.locked) {
      return errorResponse(t('auth.login.accountLocked', '账户已被临时锁定，请稍后重试'), 423)
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      await recordLoginFailure(context.env.AUTH_TOKENS, user.id, maxLoginFailures, accountLockoutSeconds)
      return errorResponse(t('auth.login.invalidCredentials'), 401);
    }

    await clearLoginFailures(context.env.AUTH_TOKENS, user.id)

    let dataKey = user.data_key;
    if (!dataKey) {
      dataKey = generateDataKey();
      try {
        await updateUserDataKey(context.env.DB, user.id, dataKey);
      } catch (dbError) {
        logger.error('Failed to update data_key', { error: dbError instanceof Error ? dbError.message : String(dbError) });
        return errorResponse(t('auth.errors.dataMigrationError'), 500);
      }
    }

    const accessToken = generateToken();
    const refreshToken = generateToken();
    const tokenCreatedAt = new Date().toISOString();

    await saveToken(context.env.AUTH_TOKENS, accessToken, {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: (user.role as 'user' | 'admin') ?? 'user',
      dataKey,
      createdAt: tokenCreatedAt,
    });

    await saveRefreshToken(context.env.AUTH_TOKENS, refreshToken, {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: (user.role as 'user' | 'admin') ?? 'user',
      dataKey,
      createdAt: tokenCreatedAt,
    });

    const cookieOptions = getSecureCookieOptions(context.req.raw);
    const isSecure = context.req.raw.url.startsWith('https://')
    const existingCsrf = getCookie(context.req.raw, getCsrfCookieName())
    const csrfCookie = existingCsrf ? '' : buildCsrfCookie(generateCsrfToken(), isSecure)
    const cookies = [
      serializeCookie('auth_token', accessToken, { ...cookieOptions, maxAge: getAccessTokenCookieMaxAge(user.role ?? 'user') }),
      serializeCookie('auth_refresh_token', refreshToken, { ...cookieOptions, maxAge: getRefreshTokenCookieMaxAge() }),
    ]
    if (csrfCookie) cookies.push(csrfCookie)
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
    }, 200, undefined, cookies.map((c) => `Set-Cookie: ${c}`));
  } catch (error) {
    logger.error('Login error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('auth.errors.loginFailed'), 500);
  }
};
