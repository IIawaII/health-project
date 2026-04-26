/**
 * Cookie 工具模块
 * 用于在 Cloudflare Workers 环境中设置、读取和删除 Cookie
 */

export interface CookieOptions {
  maxAge?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  path?: string
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  let cookie = `${name}=${encodeURIComponent(value)}`

  if (options.maxAge !== undefined) {
    cookie += `; Max-Age=${options.maxAge}`
  }
  if (options.httpOnly) {
    cookie += '; HttpOnly'
  }
  if (options.secure) {
    cookie += '; Secure'
  }
  if (options.sameSite) {
    cookie += `; SameSite=${options.sameSite}`
  }
  if (options.path) {
    cookie += `; Path=${options.path}`
  }

  return cookie
}

export function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('Cookie')
  if (!cookieHeader) return {}

  const cookies: Record<string, string> = {}
  cookieHeader.split(';').forEach((pair) => {
    const [name, ...rest] = pair.trim().split('=')
    if (name) {
      cookies[name] = rest.length > 0 ? decodeURIComponent(rest.join('=')) : ''
    }
  })

  return cookies
}

export function getCookie(request: Request, name: string): string | undefined {
  return parseCookies(request)[name]
}

/**
 * 生产环境安全的默认 Cookie 选项
 * 注意：本地 wrangler dev 使用 http://localhost，secure 为 false
 */
export function getSecureCookieOptions(request: Request): CookieOptions {
  const isSecure = request.url.startsWith('https://')
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    path: '/',
  }
}

/**
 * 获取 token 的 Cookie 有效期（秒）
 */
export function getAccessTokenCookieMaxAge(): number {
  return 15 * 60 // 15 分钟
}

export function getRefreshTokenCookieMaxAge(): number {
  return 30 * 24 * 60 * 60 // 30 天
}
