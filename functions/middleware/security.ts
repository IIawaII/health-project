/**
 * 安全头中间件
 * CSP、X-Frame-Options、HSTS 等
 */

export function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function buildCsp(scriptNonce?: string): string {
  const directives = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://challenges.cloudflare.com",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "child-src 'self' blob: https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  if (scriptNonce) {
    directives.push(
      `script-src 'self' 'nonce-${scriptNonce}' 'strict-dynamic' https://challenges.cloudflare.com`
    )
  } else {
    directives.push("script-src 'self' https://challenges.cloudflare.com")
  }
  return directives.join('; ')
}

export function addSecurityHeaders(response: Response, isHtml = false, scriptNonce?: string): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (isHtml) {
    headers.set('Content-Security-Policy', buildCsp(scriptNonce))
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
