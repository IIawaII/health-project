import { Redis } from '@upstash/redis'
import type { Env } from './env'
import { getLogger } from './logger'

const logger = getLogger('Upstash')

let redisInstance: Redis | null = null
let redisUrl: string | null = null
let redisToken: string | null = null

export function createRedisClient(env: Env): Redis {
  if (redisInstance && redisUrl === env.UPSTASH_REST_URL && redisToken === env.UPSTASH_REST_TOKEN) {
    return redisInstance
  }

  redisUrl = env.UPSTASH_REST_URL
  redisToken = env.UPSTASH_REST_TOKEN
  redisInstance = new Redis({
    url: env.UPSTASH_REST_URL,
    token: env.UPSTASH_REST_TOKEN,
    enableTelemetry: false,
  })

  return redisInstance
}

export function resetClients(): void {
  redisInstance = null
  redisUrl = null
  redisToken = null
}

export async function checkRedisConnection(env: Env): Promise<boolean> {
  try {
    const redis = createRedisClient(env)
    await redis.ping()
    return true
  } catch (err) {
    logger.warn('Upstash Redis connection check failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
