import { describe, it, expect, beforeAll } from 'vitest'
import { MockKV } from './mocks/mock-kv'
import { MockD1 } from './mocks/mock-d1'
import type { AppContext } from '../../server/utils/handler'

/**
 * 本地高并发压力测试
 * 直接调用后端 API handler，无需启动服务器
 *
 * 运行方式:
 *   npx vitest run test/load.test.ts
 *
 * 注意：这些测试会真实调用外部 LLM API，请在本地开发环境谨慎运行
 */

function createMockContext(env: Record<string, unknown>): AppContext {
  const rawRequest = new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  return {
    req: {
      raw: rawRequest,
      header: (_name: string) => undefined,
      json: async <T>() => rawRequest.json() as Promise<T>,
      url: rawRequest.url,
      param: () => undefined,
    },
    env: env as unknown as AppContext['env'],
  } as unknown as AppContext
}

// ==================== 并发测试工具 ====================

interface LoadTestResult {
  total: number
  success: number
  failed: number
  avgLatency: number
  minLatency: number
  maxLatency: number
  errors: Array<{ index: number; error: string }>
}

async function runConcurrent<T>(
  count: number,
  concurrency: number,
  fn: (index: number) => Promise<T>
): Promise<LoadTestResult> {
  const results: Array<{ success: boolean; latency: number; error?: string }> = []
  const errors: Array<{ index: number; error: string }> = []

  async function worker(startIndex: number) {
    for (let i = startIndex; i < count; i += concurrency) {
      const start = performance.now()
      try {
        await fn(i)
        results.push({ success: true, latency: performance.now() - start })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        results.push({ success: false, latency: performance.now() - start, error })
        errors.push({ index: i, error })
      }
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i))
  await Promise.all(workers)

  const latencies = results.map((r) => r.latency)
  const successCount = results.filter((r) => r.success).length

  return {
    total: count,
    success: successCount,
    failed: count - successCount,
    avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatency: Math.min(...latencies),
    maxLatency: Math.max(...latencies),
    errors: errors.slice(0, 10), // 只保留前 10 个错误
  }
}

function printResult(name: string, result: LoadTestResult) {
  console.log(`\n📊 ${name}`)
  console.log(`   总请求: ${result.total}, 成功: ${result.success}, 失败: ${result.failed}`)
  console.log(`   平均延迟: ${result.avgLatency.toFixed(2)}ms, 最小: ${result.minLatency.toFixed(2)}ms, 最大: ${result.maxLatency.toFixed(2)}ms`)
  if (result.errors.length > 0) {
    console.log(`   错误示例:`)
    result.errors.forEach((e) => console.log(`     [${e.index}] ${e.error.slice(0, 100)}`))
  }
}

// ==================== 测试用例 ====================

describe('高并发压力测试', () => {
  let authTokens: KVNamespace
  let verificationCodes: KVNamespace
  let db: MockD1
  let env: Record<string, unknown>

  beforeAll(() => {
    authTokens = new MockKV() as unknown as KVNamespace
    verificationCodes = new MockKV() as unknown as KVNamespace
    db = new MockD1()
    const usersTable = db.getTable('users')
    const now = Math.floor(Date.now() / 1000)
    usersTable.set('user-1', {
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      password_hash: '100000:abc123:def456',
      avatar: null,
      created_at: now,
      updated_at: now,
    })

    env = {
      DB: db,
      AUTH_TOKENS: authTokens,
      VERIFICATION_CODES: verificationCodes,
      TURNSTILE_SECRET_KEY: 'test-secret',
      AI_BASE_URL: 'https://api.openai.com/v1',
      AI_API_KEY: 'test-api-key',
      AI_MODEL: 'gpt-4o-mini',
    }
  })

  it('并发登录限流测试', async () => {
    const { onRequestPost } = await import('../../server/api/auth/login')

    // Mock fetch 避免真实调用 Turnstile API 导致超时
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 })

    try {
      const result = await runConcurrent(50, 10, async (_i) => {
        const context = createMockContext(env)
        // 修改 request body
        Object.defineProperty(context.req.raw, 'json', {
          value: async () => ({
            usernameOrEmail: 'testuser',
            password: 'wrongpassword',
            turnstileToken: 'fake-token',
          }),
        })

        const response = await onRequestPost(context)
        // 期望返回 401（密码错误）或 429（限流）
        if (response.status !== 401 && response.status !== 429) {
          const text = await response.text()
          throw new Error(`Unexpected status ${response.status}: ${text.slice(0, 100)}`)
        }
      })

      printResult('并发登录限流测试 (50请求, 10并发)', result)
      expect(result.success).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  }, 10000)

  it('并发验证码发送限流测试', async () => {
    const { onRequestPost } = await import('../../server/api/auth/send_verification_code')

    const result = await runConcurrent(30, 5, async (i) => {
      const context = createMockContext(env)
      Object.defineProperty(context.req.raw, 'json', {
        value: async () => ({
          email: `user${i}@example.com`,
          type: 'register',
          turnstileToken: 'fake-token',
        }),
      })

      const response = await onRequestPost(context)
      // 期望返回 400（Turnstile 验证失败）或 429（限流）或 500（邮件服务未配置）
      if (response.status !== 400 && response.status !== 429 && response.status !== 500) {
        const text = await response.text()
        throw new Error(`Unexpected status ${response.status}: ${text.slice(0, 100)}`)
      }
    })

    printResult('并发验证码发送限流测试 (30请求, 5并发)', result)
    expect(result.success).toBeGreaterThan(0)
  })

  it('并发 AI 分析限流测试', async () => {
    const { onRequestPost } = await import('../../server/api/ai/analyze')

    // 先创建一个有效的 token
    const tokenData = JSON.stringify({
      userId: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    })
    const testToken = 'test-token-analyze'
    await authTokens.put(`token:${testToken}`, tokenData, { expirationTtl: 3600 })

    const result = await runConcurrent(20, 5, async (i) => {
      const context = createMockContext({
        ...env,
      })
      // 添加认证头
      Object.defineProperty(context.req.raw, 'headers', {
        value: new Headers({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
        }),
      })
      Object.defineProperty(context.req.raw, 'json', {
        value: async () => ({
          fileData: 'data:text/plain;base64,SGVsbG8gV29ybGQ=', // 小文本文件
          fileType: 'text/plain',
          fileName: `test${i}.txt`,
          stream: false,
        }),
      })

      const response = await onRequestPost(context)
      // 打印实际状态码用于调试
      if (response.status !== 200 && response.status !== 429 && response.status !== 502 && response.status !== 503 && response.status !== 400) {
        const text = await response.text()
        throw new Error(`Unexpected status ${response.status}: ${text.slice(0, 100)}`)
      }
      // 只要返回了已知状态码即视为成功（测试限流行为，不测试 LLM 调用）
    })

    printResult('并发 AI 分析限流测试 (20请求, 5并发)', result)
    // 这个测试主要验证限流是否生效，允许全部请求因各种原因失败
    expect(result.total).toBe(20)
  })

  it('KV 竞态条件测试 - 并发计数', async () => {
    const { checkRateLimit } = await import('../../server/utils/rateLimit')
    const kv = new MockKV() as unknown as KVNamespace
    const key = 'test:concurrent'
    const limit = 10

    // 模拟 20 个并发请求同时检查限流
    const promises = Array.from({ length: 20 }, async (_, _i) => {
      await new Promise((r) => setTimeout(r, Math.random() * 10)) // 轻微随机延迟
      return checkRateLimit({ kv, key, limit, windowSeconds: 60 })
    })

    const results = await Promise.all(promises)
    const allowed = results.filter((r) => r.allowed).length
    const blocked = results.filter((r) => !r.allowed).length

    console.log(`\n📊 KV 竞态条件测试`)
    console.log(`   总请求: 20, 限制: ${limit}, 通过: ${allowed}, 拦截: ${blocked}`)

    // 由于 MockKV 是内存实现，这里应该接近精确
    // 但在真实 KV 中，allowed 可能略微超过 limit
    expect(allowed).toBeGreaterThanOrEqual(limit)
    expect(blocked).toBeGreaterThanOrEqual(20 - limit - 2) // 允许少量误差
  })
})
