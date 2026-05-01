import { getDb, requestMetrics } from '../db'
import { getLogger } from '../utils/logger'
import { getCache } from '../utils/cacheManager'
import type { Env } from '../utils/env'

const logger = getLogger('Monitor')

const DEFAULT_SUCCESS_SAMPLE_RATE = 0.1

const sampleRateCache = getCache<number>('metrics_sample_rate', { ttlMs: 60_000, maxSize: 1 })

export interface MetricRecord {
  path: string
  method: string
  statusCode: number
  latencyMs: number
  userId?: string
  ip?: string
}

async function getSuccessSampleRate(d1: D1Database): Promise<number> {
  const cached = sampleRateCache.get('rate')
  if (cached !== undefined) return cached

  try {
    const row = await d1.prepare("SELECT value FROM system_configs WHERE key = 'metrics_sample_rate'").first<{ value: string }>()
    if (row?.value) {
      const rate = parseFloat(row.value)
      if (!isNaN(rate) && rate >= 0 && rate <= 1) {
        sampleRateCache.set('rate', rate)
        return rate
      }
    }
  } catch { logger.debug('Failed to read metrics_sample_rate from system_configs, using default') }
  sampleRateCache.set('rate', DEFAULT_SUCCESS_SAMPLE_RATE)
  return DEFAULT_SUCCESS_SAMPLE_RATE
}

export function recordMetric(
  env: Env,
  ctx: ExecutionContext,
  record: MetricRecord
): void {
  const isError = record.statusCode >= 400

  if (!isError) {
    const sampleRatePromise = getSuccessSampleRate(env.DB).then((rate) => {
      if (Math.random() > rate) return
      writeMetric(env, record)
    }).catch(() => {
      if (Math.random() > DEFAULT_SUCCESS_SAMPLE_RATE) return
      writeMetric(env, record)
    })
    ctx.waitUntil(sampleRatePromise)
    return
  }

  writeMetric(env, record)
}

function writeMetric(env: Env, record: MetricRecord): void {
  const db = getDb(env.DB)
  db
    .insert(requestMetrics)
    .values({
      id: crypto.randomUUID(),
      path: record.path.slice(0, 255),
      method: record.method,
      status_code: record.statusCode,
      latency_ms: Math.round(record.latencyMs),
      user_id: record.userId ?? null,
      ip: record.ip ?? null,
      created_at: Math.floor(Date.now() / 1000),
    })
    .run()
    .catch((err) => {
      logger.warn('Failed to record metric', { error: err instanceof Error ? err.message : String(err) })
    })
}
