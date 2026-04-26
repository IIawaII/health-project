/**
 * 缓存头中间件
 */

import { addSecurityHeaders } from './security'

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
export const LONG_CACHE = 'public, max-age=604800'
export const NO_CACHE = 'no-cache, no-store, must-revalidate'

export function applyCacheHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers)

  if (pathname === '/' || pathname === '/index.html') {
    headers.set('Cache-Control', NO_CACHE)
  } else if (
    pathname.startsWith('/assets/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff')
  ) {
    headers.set('Cache-Control', IMMUTABLE_CACHE)
  } else if (
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp')
  ) {
    headers.set('Cache-Control', LONG_CACHE)
  }

  return addSecurityHeaders(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
    false
  )
}
