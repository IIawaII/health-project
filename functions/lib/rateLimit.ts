/**
 * API 速率限制工具
 * 基于 Cloudflare KV 实现简易固定窗口算法
 *
 * 注意：KV 的读取-计算-写入不是原子操作，在高并发极端场景下
 * 可能出现竞态条件（两个请求同时读到旧值）。对于本项目场景，
 * 该风险可接受；如需强一致性，应使用 Durable Objects 或 D1。
 *
 * 竞态条件说明：
 * - 触发条件：同一窗口期内，两个并发请求同时执行 kv.get() 读到相同旧值
 * - 后果：两个请求都通过检查，实际请求数可能略微超过 limit
 * - 缓解：KV 写入很快，实际超发概率极低；对非金融场景可接受
 * - 替代方案：Durable Objects 提供单实例原子操作，D1 可用事务实现原子计数
 */

interface RateLimitOptions {
  kv: KVNamespace
  key: string
  limit: number      // 时间窗口内允许的最大请求数
  windowSeconds: number  // 时间窗口（秒）
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { kv, key, limit, windowSeconds } = options
  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds
  const bucketKey = `rate_limit:${key}:${windowStart}`

  const current = await kv.get(bucketKey)
  const count = current ? parseInt(current, 10) : 0

  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: windowStart + windowSeconds,
    }
  }

  await kv.put(bucketKey, String(count + 1), {
    expirationTtl: windowSeconds,
  })

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt: windowStart + windowSeconds,
  }
}

/**
 * 构建速率限制键
 */
export function buildRateLimitKey(context: { request: Request }, suffix: string): string {
  const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  return `${clientIP}:${suffix}`
}
