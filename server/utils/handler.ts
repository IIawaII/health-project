/**
 * AI API Handler 通用包装器
 * 统一处理认证、速率限制、参数校验和错误响应
 */

import { z } from 'zod'
import type { Context } from 'hono'
import { verifyToken } from './auth'
import { errorResponse, safeErrorResponse } from './response'
import { checkRateLimit } from './rateLimit'
import { createUsageLog, getUserDailyUsageCount } from '../dao/log.dao'
import { getSystemConfig } from '../dao/config.dao'
import { getLogger } from './logger'
import { t } from '../../shared/i18n/server'
import type { Env } from './env'
import type { TokenData } from './auth'

const logger = getLogger('AIHandler')

export type AppContext = Context<{ Bindings: Env }>

function waitUntil(context: AppContext, promise: Promise<unknown>): void {
  const execCtx = context.executionCtx
  if (execCtx) {
    execCtx.waitUntil(promise)
  } else {
    // 确保 Promise 被消费，避免 unhandled rejection
    promise.catch(() => {})
  }
}

interface RateLimitConfig {
  key: string
  limit: number
  windowSeconds: number
}

interface AIHandlerOptions<T> {
  schema: z.ZodSchema<T>
  rateLimit?: RateLimitConfig
  /** 使用日志 action 标识，如 'chat' / 'analyze' / 'plan' / 'quiz' */
  action?: string
  handler: (
    data: T,
    context: AppContext,
    tokenData: TokenData
  ) => Promise<Response>
}

export function createAIHandler<T>(options: AIHandlerOptions<T>) {
  return async (context: AppContext) => {
    try {
      const tokenData = await verifyToken({ request: context.req.raw, env: context.env })
      if (!tokenData) {
        return errorResponse(t('handler.unauthorized', '未授权，请先登录'), 401)
      }

      if (options.rateLimit) {
        const rateLimit = await checkRateLimit({
          env: context.env,
          key: `ai:${tokenData.userId}:${options.rateLimit.key}`,
          limit: options.rateLimit.limit,
          windowSeconds: options.rateLimit.windowSeconds,
        })
        if (!rateLimit.allowed) {
          return errorResponse(t('handler.tooManyRequests', '请求过于频繁，请稍后重试'), 429, {
            'Retry-After': String(rateLimit.resetAt - Math.floor(Date.now() / 1000)),
          })
        }
      }

      const body = await context.req.json<unknown>()
      const parseResult = options.schema.safeParse(body)
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0]?.message || t('handler.invalidParams', '请求参数错误')
        return errorResponse(firstError, 400)
      }

      // 每日请求上限检查
      if (options.action) {
        const dailyLimitConfig = await getSystemConfig(context.env.DB, 'max_requests_per_day')
        if (dailyLimitConfig) {
          const dailyLimit = parseInt(dailyLimitConfig.value, 10)
          if (!isNaN(dailyLimit) && dailyLimit > 0) {
            const todayCount = await getUserDailyUsageCount(context.env.DB, tokenData.userId)
            if (todayCount >= dailyLimit) {
              return errorResponse(t('handler.dailyLimitReached', '每日请求上限已达到，请明天再试'), 429)
            }
          }
        }
      }

      const response = await options.handler(parseResult.data, context, tokenData)

      // 异步记录功能使用日志，不阻塞响应
      if (options.action) {
        waitUntil(
          context,
          createUsageLog(context.env.DB, {
            id: crypto.randomUUID(),
            user_id: tokenData.userId,
            action: options.action,
            metadata: null,
          }).catch((err) => {
            logger.warn('Failed to record usage log', { error: err instanceof Error ? err.message : String(err) })
          })
        )
      }

      return response
    } catch (err) {
      return safeErrorResponse(err)
    }
  }
}
