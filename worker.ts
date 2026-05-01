import { Hono } from 'hono'
import { FALLBACK_HTML } from './server/generated/spa-fallback-html'
import { api } from './server/app'
import { getMaintenanceCache, setMaintenanceCache } from './server/utils/maintenanceCache'
import { getSystemConfig } from './server/dao/config.dao'
import { getConfigNumber } from './server/utils/configDefaults'
import { addSecurityHeaders, generateNonce } from './server/middleware/security'
import { getCorsOrigin, addCorsHeaders, createCorsPreflightResponse } from './server/middleware/cors'
import { applyCacheHeaders } from './server/middleware/cache'
import { injectClientConfig, renderSpaHtml } from './server/middleware/spa'
import { recordMetric } from './server/middleware/monitor'
import { getLogger, setRequestId } from './server/utils/logger'
import { isAppError, toErrorResponse } from './server/utils/errors'
import { cleanupOldMetrics } from './server/dao/metrics.dao'
import { getDueBackupTasks, executeBackupForTask } from './server/dao/backup.dao'
import { processQueueMessage, shouldRetryMessage } from './server/queues/processor'
import { ensureAdminInDatabase } from './server/utils/adminInit'
import type { QueueMessage } from './server/queues/types'
import type { Env } from './server/utils/env'

const logger = getLogger('Worker')

type AppEnv = { Bindings: Env }

const app = new Hono<AppEnv>()

const DEFAULT_MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024

const STATIC_EXTENSIONS = new Set([
  '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.ico', '.json', '.txt', '.xml', '.webmanifest', '.woff', '.woff2',
])

const MAINTENANCE_ALLOWED_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/verify',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/config/public',
  '/api/health',
])

function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith('/assets/')) return true
  const lastDot = pathname.lastIndexOf('.')
  if (lastDot === -1) return false
  return STATIC_EXTENSIONS.has(pathname.slice(lastDot))
}

async function isRequestBodyTooLarge(request: Request, db: D1Database): Promise<boolean> {
  const contentLength = request.headers.get('Content-Length')
  if (!contentLength) return false
  const size = parseInt(contentLength, 10)
  if (isNaN(size)) return false
  const maxSize = await getConfigNumber(db, 'max_request_body_size', DEFAULT_MAX_REQUEST_BODY_SIZE)
  return size > maxSize
}

async function checkMaintenanceMode(db: D1Database): Promise<boolean> {
  const now = Date.now()
  const cached = getMaintenanceCache()
  if (cached && cached.expiry > now) {
    return cached.value
  }
  const config = await getSystemConfig(db, 'maintenance_mode')
  const isMaintenance = config?.value === 'true'
  setMaintenanceCache(isMaintenance)
  return isMaintenance
}

let adminInitialized = false

app.use('/api/*', async (context, next) => {
  if (!adminInitialized) {
    await ensureAdminInDatabase(context.env.DB, context.env.ADMIN_USERNAME, context.env.ADMIN_PASSWORD, context.env.AUTH_TOKENS)
    adminInitialized = true
  }

  const corsOrigin = getCorsOrigin(context.req.raw, context.env)

  if (context.req.method === 'OPTIONS') {
    return createCorsPreflightResponse(corsOrigin, context.req.raw)
  }

  if (await isRequestBodyTooLarge(context.req.raw, context.env.DB)) {
    logger.warn('Request body too large', {
      path: context.req.path,
      contentLength: context.req.header('Content-Length'),
    })
    return addSecurityHeaders(
      addCorsHeaders(
        context.json({ error: '请求体过大，最大支持 10MB' }, 413),
        corsOrigin
      ),
      false
    )
  }

  const startTime = Date.now()
  const requestId = context.req.header('CF-Ray') || crypto.randomUUID().slice(0, 8)
  setRequestId(requestId)

  const isMaintenance = await checkMaintenanceMode(context.env.DB)
  if (isMaintenance) {
    const path = context.req.path
    const isAllowed =
      path.startsWith('/api/admin/') ||
      MAINTENANCE_ALLOWED_PATHS.has(path)
    if (!isAllowed) {
      const statusCode = 503
      recordMetric(context.env, context.executionCtx, {
        path, method: context.req.method, statusCode,
        latencyMs: Date.now() - startTime,
        ip: context.req.header('CF-Connecting-IP') ?? undefined,
      })
      return addSecurityHeaders(
        addCorsHeaders(
          context.json({ error: '系统维护中，请稍后访问' }, statusCode),
          corsOrigin
        ),
        false
      )
    }
  }

  await next()

  recordMetric(context.env, context.executionCtx, {
    path: context.req.path,
    method: context.req.method,
    statusCode: context.res.status,
    latencyMs: Date.now() - startTime,
    ip: context.req.header('CF-Connecting-IP') ?? undefined,
  })

  context.res = addCorsHeaders(context.res, corsOrigin)
  context.res = addSecurityHeaders(context.res, false)
})

app.route('/api', api)

app.get('*', async (context) => {
  const url = new URL(context.req.url)
  const env = context.env

  if (!isStaticAsset(url.pathname)) {
    if (env.ASSETS) {
      const indexRequest = new Request(new URL('/index.html', context.req.url), context.req.raw)
      const indexResponse = await env.ASSETS.fetch(indexRequest)
      if (indexResponse.ok) {
        return renderSpaHtml(indexResponse, env)
      }
    }
    const fallbackNonce = generateNonce()
    const res = new Response(injectClientConfig(FALLBACK_HTML, env, undefined, fallbackNonce), {
      headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    })
    return addSecurityHeaders(res, true, fallbackNonce)
  }

  if (env.ASSETS) {
    const assetResponse = await env.ASSETS.fetch(context.req.raw)

    if (assetResponse.status === 404) {
      const indexRequest = new Request(new URL('/index.html', context.req.url), context.req.raw)
      const indexResponse = await env.ASSETS.fetch(indexRequest)
      return renderSpaHtml(indexResponse, env)
    }

    return applyCacheHeaders(assetResponse, url.pathname)
  }

  return addSecurityHeaders(new Response('Not Found', { status: 404 }), false)
})

app.onError((err, context) => {
  if (isAppError(err)) {
    const corsOrigin = getCorsOrigin(context.req.raw, context.env)
    return addSecurityHeaders(
      addCorsHeaders(toErrorResponse(err), corsOrigin),
      false
    )
  }
  logger.error('Unhandled worker error', {
    path: context.req.path,
    method: context.req.method,
    error: err instanceof Error ? err.message : String(err),
  })
  const corsOrigin = getCorsOrigin(context.req.raw, context.env)
  return addSecurityHeaders(
    addCorsHeaders(
      context.json({ error: '服务器内部错误，请稍后重试' }, 500),
      corsOrigin
    ),
    false
  )
})

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      cleanupOldMetrics(env.DB).catch((err) => {
        logger.error('Scheduled metrics cleanup failed', { error: err instanceof Error ? err.message : String(err) })
      })
    )

    ctx.waitUntil(
      (async () => {
        try {
          const now = Math.floor(Date.now() / 1000)
          const dueTasks = await getDueBackupTasks(env.DB, now)
          const failedTasks: { taskId: string; taskName: string; error: string }[] = []
          for (const task of dueTasks) {
            try {
              await executeBackupForTask(env.DB, task.id)
              logger.info('Scheduled backup completed', { taskId: task.id, taskName: task.name })
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err)
              logger.error('Scheduled backup failed', {
                taskId: task.id,
                error: errorMsg,
              })
              failedTasks.push({ taskId: task.id, taskName: task.name, error: errorMsg })
            }
          }
          if (failedTasks.length > 0 && env.SMTP_USER) {
            try {
              const adminEmail = env.SMTP_USER
              const taskList = failedTasks.map(t => `- ${t.taskName} (${t.taskId}): ${t.error}`).join('\n')
              const notifySubject = `[Cloud Health] 备份失败通知 - ${failedTasks.length} 个任务失败`
              const notifyHtml = `<h2>备份失败通知</h2><p>以下定时备份任务执行失败：</p><pre>${taskList}</pre><p>请尽快检查并处理。</p>`
              if (env.EMAIL_QUEUE && env.ENVIRONMENT === 'production') {
                await env.EMAIL_QUEUE.send({
                  type: 'send_email',
                  payload: {
                    to: adminEmail,
                    subject: notifySubject,
                    html: notifyHtml,
                  },
                })
                logger.info('Backup failure notification queued', { failedCount: failedTasks.length })
              } else {
                const { sendEmailViaSMTP } = await import('./server/utils/smtp')
                const smtpConfig = {
                  host: env.SMTP_HOST || 'smtp.163.com',
                  port: parseInt(env.SMTP_PORT || '465', 10),
                  user: env.SMTP_USER,
                  pass: env.SMTP_PASS!,
                  fromEmail: env.SMTP_USER,
                  fromName: 'Cloud Health',
                }
                await sendEmailViaSMTP(smtpConfig, adminEmail, notifySubject, notifyHtml)
                logger.info('Backup failure notification sent directly', { failedCount: failedTasks.length })
              }
            } catch (notifyErr) {
              logger.error('Failed to send backup failure notification', {
                error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
              })
            }
          }
        } catch (err) {
          logger.error('Scheduled backup check failed', { error: err instanceof Error ? err.message : String(err) })
        }
      })()
    )
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env, _ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processQueueMessage(env, message.body)
        message.ack()
      } catch (err) {
        const attempt = message.attempts ?? 1
        const { retry, delaySeconds } = shouldRetryMessage(err, attempt)
        logger.error('Queue message processing failed', {
          type: message.body.type,
          error: err instanceof Error ? err.message : String(err),
          attempt,
          willRetry: retry,
        })
        if (retry) {
          message.retry({ delaySeconds })
        } else {
          message.ack()
        }
      }
    }
  },
}
