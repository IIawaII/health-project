// API handlers
import { FALLBACK_HTML } from './src/spa-fallback-html'
import * as authRegister from './functions/api/auth/register'
import * as authLogin from './functions/api/auth/login'
import * as authLogout from './functions/api/auth/logout'
import * as authVerify from './functions/api/auth/verify'
import * as authChangePassword from './functions/api/auth/change_password'
import * as authUpdateProfile from './functions/api/auth/update_profile'
import * as authCheck from './functions/api/auth/check'
import * as authSendVerificationCode from './functions/api/auth/send_verification_code'
import * as chatHandler from './functions/api/chat'
import * as analyzeHandler from './functions/api/analyze'
import * as planHandler from './functions/api/plan'
import * as quizHandler from './functions/api/quiz'

interface Env {
  USERS: KVNamespace
  AUTH_TOKENS: KVNamespace
  VERIFICATION_CODES: KVNamespace
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY: string
  RESEND_API_KEY?: string
  AI_API_KEY: string
  AI_BASE_URL: string
  AI_MODEL: string
  ALLOWED_ORIGINS?: string
  ASSETS?: Fetcher
}

function createContext(request: Request, env: Env) {
  return {
    request,
    env,
    params: {},
    data: {},
    next: () => Promise.resolve(new Response('Not Found', { status: 404 })),
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as EventContext<Env, string, Record<string, unknown>>
}

/**
 * 根据请求 Origin 和环境变量返回允许的 CORS Origin
 * 生产环境：必须在 Cloudflare Dashboard 设置 ALLOWED_ORIGINS（如 https://example.com）
 * 开发环境：未设置时允许所有（*）
 */
function getCorsOrigin(request: Request, env: Env): string {
  const allowed = env.ALLOWED_ORIGINS
  if (!allowed) return '*'

  const origin = request.headers.get('Origin') || ''
  const list = allowed.split(',').map((s) => s.trim())
  return list.includes(origin) ? origin : list[0] || '*'
}

/**
 * 为静态资源添加浏览器缓存头
 */
function applyCacheHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers)

  if (pathname === '/' || pathname === '/index.html') {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  } else if (
    pathname.startsWith('/assets/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff')
  ) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp')
  ) {
    headers.set('Cache-Control', 'public, max-age=604800, must-revalidate')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * 将公开的环境变量注入到 HTML 中，供前端运行时读取
 */
function injectClientConfig(html: string, env: Env): string {
  const config: Record<string, string> = {}
  if (env.TURNSTILE_SITE_KEY) {
    config.TURNSTILE_SITE_KEY = env.TURNSTILE_SITE_KEY
  }
  if (Object.keys(config).length === 0) return html
  const script = `<script>window.__ENV__=${JSON.stringify(config)}</script>`
  return html.replace('</head>', `${script}</head>`)
}

/**
 * 读取 HTML 响应并注入客户端配置
 */
async function renderSpaHtml(response: Response, env: Env): Promise<Response> {
  const html = await response.text()
  const injected = injectClientConfig(html, env)
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

type Handler = (context: EventContext<Env, string, Record<string, unknown>>) => Promise<Response>

const routes: Array<{
  method: string
  path: string
  handler: Handler
}> = [
  { method: 'POST', path: '/api/auth/register', handler: authRegister.onRequestPost as Handler },
  { method: 'POST', path: '/api/auth/login', handler: authLogin.onRequestPost as Handler },
  { method: 'POST', path: '/api/auth/logout', handler: authLogout.onRequestPost as Handler },
  { method: 'GET', path: '/api/auth/verify', handler: authVerify.onRequestGet as Handler },
  { method: 'POST', path: '/api/auth/change_password', handler: authChangePassword.onRequestPost as Handler },
  { method: 'POST', path: '/api/auth/update_profile', handler: authUpdateProfile.onRequestPost as Handler },
  { method: 'POST', path: '/api/auth/check', handler: authCheck.onRequestPost as Handler },
  { method: 'POST', path: '/api/auth/send_verification_code', handler: authSendVerificationCode.onRequestPost as Handler },
  { method: 'POST', path: '/api/chat', handler: chatHandler.onRequestPost as Handler },
  { method: 'POST', path: '/api/analyze', handler: analyzeHandler.onRequestPost as Handler },
  { method: 'POST', path: '/api/plan', handler: planHandler.onRequestPost as Handler },
  { method: 'POST', path: '/api/quiz', handler: quizHandler.onRequestPost as Handler },
]

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url)
      const corsOrigin = getCorsOrigin(request, env)

      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          },
        })
      }

      // API routes
      const route = routes.find((r) => r.method === request.method && r.path === url.pathname)

      if (route) {
        const response = await route.handler(createContext(request, env))
        // 为 API 响应注入 CORS 头（如果 handler 未设置）
        if (!response.headers.has('Access-Control-Allow-Origin')) {
          const headers = new Headers(response.headers)
          headers.set('Access-Control-Allow-Origin', corsOrigin)
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        }
        return response
      }

      // 判断是否为静态资源
      const isStaticAsset =
        url.pathname.startsWith('/assets/') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.jpeg') ||
        url.pathname.endsWith('.webp') ||
        url.pathname.endsWith('.woff') ||
        url.pathname.endsWith('.woff2')

      // SPA 路由回退：非 API 请求且非静态资源请求返回 index.html
      if (!url.pathname.startsWith('/api/') && !isStaticAsset) {
        if (env.ASSETS) {
          const indexRequest = new Request(new URL('/index.html', request.url), request)
          const indexResponse = await env.ASSETS.fetch(indexRequest)
          return renderSpaHtml(indexResponse, env)
        }
        // ASSETS 不可用时直接返回 index.html 内容（SPA 路由由前端处理）
        return new Response(injectClientConfig(FALLBACK_HTML, env), {
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        })
      }

      // Static assets fallback
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request)

        if (assetResponse.status === 404 && !url.pathname.startsWith('/api/')) {
          const indexRequest = new Request(new URL('/index.html', request.url), request)
          const indexResponse = await env.ASSETS.fetch(indexRequest)
          return renderSpaHtml(indexResponse, env)
        }

        return applyCacheHeaders(assetResponse, url.pathname)
      }

      // ASSETS 不可用时返回 404
      return new Response('Not Found', { status: 404 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': getCorsOrigin(request, env),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }
  },
}
