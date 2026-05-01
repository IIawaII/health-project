import type { Env } from '../utils/env'

export function getCorsOrigin(request: Request, env: Env): string {
  const allowed = env.ALLOWED_ORIGINS
  const origin = request.headers.get('Origin') || ''

  if (!allowed) {
    const isDev = env.ENVIRONMENT === 'development'
    if (!isDev) {
      return ''
    }
    const localOrigins = ['http://localhost:5173', 'http://localhost:8787', 'http://127.0.0.1:5173']
    return localOrigins.includes(origin) ? origin : ''
  }

  const list = allowed.split(',').map((s) => s.trim())
  return list.includes(origin) ? origin : ''
}

const ALLOWED_CUSTOM_HEADERS = new Set([
  'content-type',
  'authorization',
  'x-requested-with',
])

function filterAllowedHeaders(requestHeaders: string | null): string {
  if (!requestHeaders) return 'Content-Type, Authorization, X-Requested-With'
  const requested = requestHeaders.split(',').map((h) => h.trim().toLowerCase())
  const allowed = requested.filter((h) => ALLOWED_CUSTOM_HEADERS.has(h))
  if (allowed.length === 0) return 'Content-Type'
  return allowed.join(', ')
}

export function addCorsHeaders(response: Response, corsOrigin: string): Response {
  const headers = new Headers(response.headers)
  if (corsOrigin) {
    headers.set('Access-Control-Allow-Origin', corsOrigin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Vary', 'Origin')
  }
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function createCorsPreflightResponse(corsOrigin: string, request: Request): Response {
  const requestHeaders = request.headers.get('Access-Control-Request-Headers')
  const allowedHeaders = filterAllowedHeaders(requestHeaders)
  const requestMethod = request.headers.get('Access-Control-Request-Method')

  const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
  const method = allowedMethods.has(requestMethod || '') ? requestMethod! : 'GET, POST'

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': method,
      'Access-Control-Allow-Headers': allowedHeaders,
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  })
}
