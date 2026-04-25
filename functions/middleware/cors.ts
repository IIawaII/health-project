/**
 * CORS 中间件
 */

import type { Env } from '../lib/env'

export function getCorsOrigin(request: Request, env: Env): string {
  const allowed = env.ALLOWED_ORIGINS
  const origin = request.headers.get('Origin') || ''

  if (!allowed) {
    // 生产环境未配置 ALLOWED_ORIGINS 时，拒绝所有跨域来源
    const isDev = env.ASSETS === undefined || request.url.includes('localhost') || request.url.includes('127.0.0.1')
    if (!isDev) {
      return ''
    }
    const localOrigins = ['http://localhost:5173', 'http://localhost:8787', 'http://127.0.0.1:5173']
    return localOrigins.includes(origin) ? origin : ''
  }

  const list = allowed.split(',').map((s) => s.trim())
  return list.includes(origin) ? origin : ''
}

export function addCorsHeaders(response: Response, corsOrigin: string): Response {
  if (response.headers.has('Access-Control-Allow-Origin')) {
    return response
  }
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', corsOrigin)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function createCorsPreflightResponse(corsOrigin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AI-Base-URL, X-AI-API-Key, X-AI-Model',
      'Access-Control-Max-Age': '86400',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  })
}
