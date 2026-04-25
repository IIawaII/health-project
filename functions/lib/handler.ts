/**
 * AI API Handler 通用包装器
 * 统一处理认证、速率限制、参数校验和错误响应
 */

import { z } from 'zod'
import { verifyToken } from './auth'
import { errorResponse, safeErrorResponse } from './response'
import { checkRateLimit } from './rateLimit'
import type { Env } from './env'
import type { TokenData } from './auth'

interface RateLimitConfig {
  key: string
  limit: number
  windowSeconds: number
}

interface AIHandlerOptions<T> {
  schema: z.ZodSchema<T>
  rateLimit?: RateLimitConfig
  handler: (
    data: T,
    context: EventContext<Env, string, Record<string, unknown>>,
    tokenData: TokenData
  ) => Promise<Response>
}

export function createAIHandler<T>(options: AIHandlerOptions<T>) {
  return async (context: EventContext<Env, string, Record<string, unknown>>) => {
    try {
      const tokenData = await verifyToken(context)
      if (!tokenData) {
        return errorResponse('未授权', 401)
      }

      if (options.rateLimit) {
        const rateLimit = await checkRateLimit({
          kv: context.env.AUTH_TOKENS,
          key: `ai:${tokenData.userId}:${options.rateLimit.key}`,
          limit: options.rateLimit.limit,
          windowSeconds: options.rateLimit.windowSeconds,
        })
        if (!rateLimit.allowed) {
          return errorResponse('请求过于频繁，请稍后再试', 429, {
            'Retry-After': String(rateLimit.resetAt - Math.floor(Date.now() / 1000)),
          })
        }
      }

      const body = await context.request.json<unknown>()
      const parseResult = options.schema.safeParse(body)
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0]?.message || '请求参数错误'
        return errorResponse(firstError, 400)
      }

      return await options.handler(parseResult.data, context, tokenData)
    } catch (err) {
      return safeErrorResponse(err)
    }
  }
}
