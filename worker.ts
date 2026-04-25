// API handlers
import { Hono } from 'hono'
import type { Context } from 'hono'
import { FALLBACK_HTML } from './src/spa-fallback-html'
import * as authRegister from './functions/api/auth/register'
import * as authLogin from './functions/api/auth/login'
import * as authLogout from './functions/api/auth/logout'
import * as authVerify from './functions/api/auth/verify'
import * as authChangePassword from './functions/api/auth/change_password'
import * as authUpdateProfile from './functions/api/auth/update_profile'
import * as authCheck from './functions/api/auth/check'
import * as authSendVerificationCode from './functions/api/auth/send_verification_code'
import * as authRefresh from './functions/api/auth/refresh'
import * as chatHandler from './functions/api/chat'
import * as analyzeHandler from './functions/api/analyze'
import * as planHandler from './functions/api/plan'
import * as quizHandler from './functions/api/quiz'

import { generateNonce, addSecurityHeaders } from './functions/middleware/security'
import { getCorsOrigin, addCorsHeaders, createCorsPreflightResponse } from './functions/middleware/cors'
import { applyCacheHeaders } from './functions/middleware/cache'
import { injectClientConfig, renderSpaHtml } from './functions/middleware/spa'
import { createContext } from './functions/middleware/context'
import type { Env } from './functions/lib/env'

type PagesHandler = (context: EventContext<Env, string, Record<string, unknown>>) => Promise<Response>
type AppEnv = { Bindings: Env }

function asHonoHandler(handler: PagesHandler) {
  return (context: Context<AppEnv>) => {
    const execCtx = (context as unknown as { executionCtx?: ExecutionContext }).executionCtx
    return handler(createContext(context.req.raw, context.env, execCtx))
  }
}

const api = new Hono<AppEnv>()

api.post('/api/auth/register', asHonoHandler(authRegister.onRequestPost as PagesHandler))
api.post('/api/auth/login', asHonoHandler(authLogin.onRequestPost as PagesHandler))
api.post('/api/auth/logout', asHonoHandler(authLogout.onRequestPost as PagesHandler))
api.get('/api/auth/verify', asHonoHandler(authVerify.onRequestGet as PagesHandler))
api.post('/api/auth/change_password', asHonoHandler(authChangePassword.onRequestPost as PagesHandler))
api.post('/api/auth/update_profile', asHonoHandler(authUpdateProfile.onRequestPost as PagesHandler))
api.post('/api/auth/check', asHonoHandler(authCheck.onRequestPost as PagesHandler))
api.post('/api/auth/send_verification_code', asHonoHandler(authSendVerificationCode.onRequestPost as PagesHandler))
api.post('/api/auth/refresh', asHonoHandler(authRefresh.onRequestPost as PagesHandler))
api.post('/api/chat', asHonoHandler(chatHandler.onRequestPost as PagesHandler))
api.post('/api/analyze', asHonoHandler(analyzeHandler.onRequestPost as PagesHandler))
api.post('/api/plan', asHonoHandler(planHandler.onRequestPost as PagesHandler))
api.post('/api/quiz', asHonoHandler(quizHandler.onRequestPost as PagesHandler))
api.get('/api/health', (context) => {
  return context.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const STATIC_EXTENSIONS = new Set([
  '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.ico', '.json', '.txt', '.xml', '.webmanifest', '.woff', '.woff2',
])

function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith('/assets/')) return true
  const lastDot = pathname.lastIndexOf('.')
  if (lastDot === -1) return false
  return STATIC_EXTENSIONS.has(pathname.slice(lastDot))
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url)
      const corsOrigin = getCorsOrigin(request, env)

      if (request.method === 'OPTIONS') {
        return createCorsPreflightResponse(corsOrigin)
      }

      if (url.pathname.startsWith('/api/')) {
        const response = await api.fetch(request, env, ctx)
        return addCorsHeaders(response, corsOrigin)
      }

      // SPA 路由回退：非 API 请求且非静态资源请求返回 index.html
      if (!url.pathname.startsWith('/api/') && !isStaticAsset(url.pathname)) {
        const nonce = generateNonce()
        if (env.ASSETS) {
          const indexRequest = new Request(new URL('/index.html', request.url), request)
          const indexResponse = await env.ASSETS.fetch(indexRequest)
          if (indexResponse.ok) {
            return renderSpaHtml(indexResponse, env, nonce)
          }
        }
        const res = new Response(injectClientConfig(FALLBACK_HTML, env, nonce), {
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        })
        return addSecurityHeaders(res, true, nonce)
      }

      // Static assets fallback
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request)

        if (assetResponse.status === 404 && !url.pathname.startsWith('/api/')) {
          const nonce = generateNonce()
          const indexRequest = new Request(new URL('/index.html', request.url), request)
          const indexResponse = await env.ASSETS.fetch(indexRequest)
          return renderSpaHtml(indexResponse, env, nonce)
        }

        return applyCacheHeaders(assetResponse, url.pathname)
      }

      // ASSETS 不可用时返回 404
      return addSecurityHeaders(new Response('Not Found', { status: 404 }), false)
    } catch (err) {
      console.error('[Worker Error]', err)
      const errorCorsOrigin = getCorsOrigin(request, env)
      return addSecurityHeaders(
        addCorsHeaders(
          new Response(JSON.stringify({ error: '服务器内部错误，请稍后重试' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
          errorCorsOrigin
        ),
        false
      )
    }
  },
}
