import { errorResponse } from '../utils/response'
import { getCookie, serializeCookie } from '../utils/cookie'
import { getLogger } from '../utils/logger'
import { t } from '../../shared/i18n/server'
import type { AppContext } from '../utils/handler'

const logger = getLogger('CSRF')

const EXEMPT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/sendVerificationCode',
  '/api/auth/check',
])

const CSRF_COOKIE_NAME = 'csrf-token'
const CSRF_HEADER_NAME = 'X-CSRF-Token'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    a.charCodeAt(0)
    for (let i = 1; i < b.length; i++) a.charCodeAt(i)
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export function generateCsrfToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getCsrfCookieName(): string {
  return CSRF_COOKIE_NAME
}

export function getCsrfHeaderName(): string {
  return CSRF_HEADER_NAME
}

export function buildCsrfCookie(token: string, isSecure: boolean): string {
  return serializeCookie(CSRF_COOKIE_NAME, token, {
    secure: isSecure,
    sameSite: 'Strict',
    path: '/',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  })
}

export function requireCsrfProtection(context: AppContext): Response | null {
  const method = context.req.method

  if (EXEMPT_METHODS.has(method)) {
    return null
  }

  const path = new URL(context.req.url).pathname
  if (EXEMPT_PATHS.has(path)) {
    return null
  }

  const cookieToken = getCookie(context.req.raw, CSRF_COOKIE_NAME)
  const headerToken = context.req.header(CSRF_HEADER_NAME)

  if (!cookieToken || !headerToken) {
    logger.warn('CSRF protection: missing token', {
      path,
      method,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
    })
    return errorResponse(t('csrf.missingToken', 'CSRF 令牌缺失'), 403)
  }

  if (!timingSafeEqual(cookieToken, headerToken)) {
    logger.warn('CSRF protection: token mismatch', {
      path,
      method,
    })
    return errorResponse(t('csrf.invalidToken', 'CSRF 令牌验证失败'), 403)
  }

  return null
}
