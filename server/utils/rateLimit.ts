import { Ratelimit } from '@upstash/ratelimit'
import { createRedisClient } from './upstash'
import { getCache } from './cacheManager'
import { getLogger } from './logger'
import type { Env } from './env'

const logger = getLogger('RateLimit')

export interface RateLimitOptions {
  env: Env
  key: string
  limit: number
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

const ratelimitCache = getCache<Ratelimit>('ratelimit', { ttlMs: Infinity, maxSize: 50 })

function getRatelimiter(env: Env, limit: number, windowSeconds: number): Ratelimit {
  const redis = createRedisClient(env)

  const cacheKey = `${limit}:${windowSeconds}`
  const cached = ratelimitCache.get(cacheKey)
  if (cached) return cached

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: 'cloud-health:ratelimit',
    ephemeralCache: new Map<string, number>(),
  })

  ratelimitCache.set(cacheKey, ratelimit)
  return ratelimit
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { env, key, limit, windowSeconds } = options

  const ratelimit = getRatelimiter(env, limit, windowSeconds)

  try {
    const result = await ratelimit.limit(key)
    const now = Math.floor(Date.now() / 1000)

    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: now + result.reset,
    }
  } catch (err) {
    logger.error('Upstash rate limit check failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export function buildRateLimitKey(context: { request: Request }, suffix: string): string {
  const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  return `${clientIP}:${suffix}`
}

export function resetRatelimitCache(): void {
  ratelimitCache.clear()
}
