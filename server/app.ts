import { Hono } from 'hono'
import * as authRegister from './api/auth/register'
import * as authLogin from './api/auth/login'
import * as authLogout from './api/auth/logout'
import * as authVerify from './api/auth/verify'
import * as authChangePassword from './api/auth/changePassword'
import * as authUpdateProfile from './api/auth/updateProfile'
import * as authCheck from './api/auth/check'
import * as authSendVerificationCode from './api/auth/sendVerificationCode'
import * as authRefresh from './api/auth/refresh'
import * as authAiConfig from './api/auth/ai-config'
import * as chatHandler from './api/ai/chat'
import * as analyzeHandler from './api/ai/analyze'
import * as planHandler from './api/ai/plan'
import * as quizHandler from './api/ai/quiz'
import * as validateUrlHandler from './api/ai/validate-url'
import * as adminStats from './api/admin/stats'
import * as adminUsers from './api/admin/users'
import * as adminLogs from './api/admin/logs'
import * as adminAudit from './api/admin/audit'
import * as adminConfig from './api/admin/config'
import * as adminMetrics from './api/admin/metrics'
import * as adminBackup from './api/admin/backup'
import * as publicConfig from './api/config/public'
import { openApiDocument } from './openapi'
import { requireCsrfProtection, generateCsrfToken, buildCsrfCookie, getCsrfCookieName } from './middleware/csrf'
import { addSecurityHeaders, generateNonce } from './middleware/security'
import { getCookie } from './utils/cookie'
import { withAdmin } from './middleware/admin'
import { toErrorResponse, isAppError } from './utils/errors'
import { getLogger } from './utils/logger'
import type { Env } from './utils/env'

const logger = getLogger('API')

type AppEnv = { Bindings: Env }

const api = new Hono<AppEnv>()

api.onError((err, context) => {
  if (isAppError(err)) {
    return toErrorResponse(err)
  }
  logger.error('Unhandled API error', {
    path: context.req.path,
    method: context.req.method,
    error: err instanceof Error ? err.message : String(err),
  })
  return toErrorResponse(err)
})

api.use('*', async (context, next) => {
  if (context.env.DB) {
    (globalThis as Record<string, unknown>).__D1_DB = context.env.DB
  }
  const csrfError = requireCsrfProtection(context)
  if (csrfError) return csrfError
  await next()

  const existingCsrf = getCookie(context.req.raw, getCsrfCookieName(context.req.raw))
  if (!existingCsrf) {
    const csrfToken = generateCsrfToken()
    const isSecure = context.req.url.startsWith('https://')
    context.header('Set-Cookie', buildCsrfCookie(csrfToken, isSecure), { append: true })
  }
})

api.post('/auth/register', authRegister.onRequestPost)
api.post('/auth/login', authLogin.onRequestPost)
api.post('/auth/logout', authLogout.onRequestPost)
api.get('/auth/verify', authVerify.onRequestGet)
api.post('/auth/changePassword', authChangePassword.onRequestPost)
api.post('/auth/updateProfile', authUpdateProfile.onRequestPost)
api.post('/auth/check', authCheck.onRequestPost)
api.post('/auth/sendVerificationCode', authSendVerificationCode.onRequestPost)
api.post('/auth/refresh', authRefresh.onRequestPost)
api.get('/auth/ai-config', authAiConfig.onRequestGet)
api.put('/auth/ai-config', authAiConfig.onRequestPut)
api.delete('/auth/ai-config', authAiConfig.onRequestDelete)

api.post('/chat', chatHandler.onRequestPost)
api.post('/analyze', analyzeHandler.onRequestPost)
api.post('/plan', planHandler.onRequestPost)
api.post('/quiz', quizHandler.onRequestPost)
api.post('/validate-url', validateUrlHandler.onRequestPost)
api.get('/validate-url', validateUrlHandler.onRequestGet)

api.get('/admin/stats', adminStats.onRequestGet)
api.get('/admin/users', adminUsers.onRequestGet)
api.patch('/admin/users/:id', adminUsers.onRequestPatch)
api.delete('/admin/users/:id', adminUsers.onRequestDelete)
api.get('/admin/logs', adminLogs.onRequestGet)
api.get('/admin/audit', adminAudit.onRequestGet)
api.get('/admin/config', adminConfig.onRequestGet)
api.put('/admin/config', adminConfig.onRequestPut)

api.get('/admin/metrics/overview', adminMetrics.onRequestGetOverview)
api.get('/admin/metrics/trend', adminMetrics.onRequestGetTrend)
api.get('/admin/metrics/paths', adminMetrics.onRequestGetPaths)
api.get('/admin/metrics/status-codes', adminMetrics.onRequestGetStatusCodes)
api.get('/admin/metrics/errors', adminMetrics.onRequestGetErrors)

api.get('/admin/backups', adminBackup.onRequestGet)
api.post('/admin/backups', adminBackup.onRequestPost)
api.patch('/admin/backups/:id', adminBackup.onRequestPatch)
api.delete('/admin/backups/:id', adminBackup.onRequestDelete)

api.get('/config/public', publicConfig.onRequestGet)

api.get('/health', async (context) => {
  const clientIP = context.req.raw.headers.get('CF-Connecting-IP') || 'unknown'
  const rateLimitKey = `${clientIP}:health`
  try {
    const { checkRateLimit } = await import('./utils/rateLimit')
    const rateResult = await checkRateLimit({
      env: context.env,
      key: rateLimitKey,
      limit: 60,
      windowSeconds: 60,
    })
    if (!rateResult.allowed) {
      return context.json({ error: '请求过于频繁，请稍后重试' }, 429)
    }
  } catch {
    // 速率限制检查失败时放行，避免 Redis 不可用时阻塞健康检查
  }

  const checks: Record<string, boolean> = {}
  const details: Record<string, string> = {}

  try {
    await context.env.DB.prepare('SELECT 1').first()
    checks.db = true
  } catch (err) {
    checks.db = false
    details.db = err instanceof Error ? err.message : String(err)
  }

  try {
    const { checkRedisConnection } = await import('./utils/upstash')
    checks.redis = await checkRedisConnection(context.env)
  } catch (err) {
    checks.redis = false
    details.redis = err instanceof Error ? err.message : String(err)
  }

  const healthy = checks.db && checks.redis
  return context.json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    details: Object.keys(details).length > 0 ? details : undefined,
    timestamp: new Date().toISOString(),
  }, healthy ? 200 : 503)
})

api.post('/client-error', async (context) => {
  try {
    const clientIP = context.req.raw.headers.get('CF-Connecting-IP') || 'unknown'
    try {
      const { checkRateLimit } = await import('./utils/rateLimit')
      const rateResult = await checkRateLimit({
        env: context.env,
        key: `${clientIP}:client-error`,
        limit: 10,
        windowSeconds: 60,
      })
      if (!rateResult.allowed) {
        return context.json({ ok: true }, 200)
      }
    } catch { /* rate limit check failed, allow through */ }

    const body = await context.req.json<{ message?: string; stack?: string; componentStack?: string; url?: string; userAgent?: string }>().catch(() => null)
    if (body?.message) {
      logger.warn('Client error reported', {
        message: String(body.message).slice(0, 500),
        stack: body.stack ? String(body.stack).slice(0, 1000) : undefined,
        componentStack: body.componentStack ? String(body.componentStack).slice(0, 1000) : undefined,
        url: body.url ? String(body.url).slice(0, 200) : undefined,
        userAgent: body.userAgent ? String(body.userAgent).slice(0, 200) : undefined,
      })
    }
    return context.json({ ok: true }, 200)
  } catch {
    return context.json({ ok: true }, 200)
  }
})

api.get('/docs/openapi.json', withAdmin(async (context) => {
  return context.json(openApiDocument)
}))

api.get('/docs', withAdmin(async (context) => {
  const nonce = generateNonce().slice(0, 16)
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Cloud Health API Docs</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" type="text/css" href="/api/docs/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script nonce="${nonce}" src="/api/docs/swagger-ui-bundle.js"></script>
  <script nonce="${nonce}">
    SwaggerUIBundle({
      url: '/api/docs/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    })
  </script>
</body>
</html>`
  const response = context.html(html)
  return addSecurityHeaders(response, true, nonce)
}))

api.get('/docs/swagger-ui.css', withAdmin(async () => {
  const mod = await import('swagger-ui-dist/swagger-ui.css')
  const css = typeof mod === 'string' ? mod : (mod as { default?: string }).default ?? String(mod)
  return new Response(css, { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'public, max-age=86400' } })
}))

api.get('/docs/swagger-ui-bundle.js', withAdmin(async () => {
  const mod = await import('swagger-ui-dist/swagger-ui-bundle.js')
  const js = typeof mod === 'string' ? mod : (mod as { default?: string }).default ?? String(mod)
  return new Response(js, { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=86400' } })
}))

export { api }
