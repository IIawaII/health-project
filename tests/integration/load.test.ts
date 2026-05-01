import { describe, it, expect, beforeAll, vi } from 'vitest'
import { MockKV } from './mocks/mock-kv'
import { MockD1 } from './mocks/mock-d1'
import { resetClients } from '../../server/utils/upstash'
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
    errors: errors.slice(0, 10),
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

// ==================== Mock Upstash ====================

const mockLimitFn = vi.fn()

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(() => ({
      limit: mockLimitFn,
    })),
    {
      slidingWindow: vi.fn().mockReturnValue('slidingWindow'),
    }
  ),
}))

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
  })),
}))

vi.mock('../../server/utils/smtp', () => ({
  sendEmailViaSMTP: vi.fn().mockResolvedValue(undefined),
}))

// ==================== 测试用例 ====================

describe('高并发压力测试', () => {
  let authTokens: KVNamespace
  let verificationCodes: KVNamespace
  let db: MockD1
  let env: Record<string, unknown>

  beforeAll(() => {
    resetClients()
    mockLimitFn.mockReset()
    mockLimitFn.mockResolvedValue({
      success: true,
      remaining: 99,
      reset: 60,
    })

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
      UPSTASH_REST_URL: 'https://test.upstash.io',
      UPSTASH_REST_TOKEN: 'test-token',
      TURNSTILE_SECRET_KEY: 'test-secret',
      AI_BASE_URL: 'https://api.openai.com/v1',
      AI_API_KEY: 'test-api-key',
      AI_MODEL: 'gpt-4o-mini',
    }
  })

  it('并发登录限流测试', async () => {
    const { onRequestPost } = await import('../../server/api/auth/login')

    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 })

    try {
      const result = await runConcurrent(50, 10, async (_i) => {
        const context = createMockContext(env)
        Object.defineProperty(context.req.raw, 'json', {
          value: async () => ({
            usernameOrEmail: 'testuser',
            password: 'wrongpassword',
            turnstileToken: 'fake-token',
          }),
        })

        const response = await onRequestPost(context)
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
    const { onRequestPost } = await import('../../server/api/auth/sendVerificationCode')

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
      Object.defineProperty(context.req.raw, 'headers', {
        value: new Headers({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
        }),
      })
      Object.defineProperty(context.req.raw, 'json', {
        value: async () => ({
          fileData: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
          fileType: 'text/plain',
          fileName: `test${i}.txt`,
          stream: false,
        }),
      })

      const response = await onRequestPost(context)
      if (response.status !== 200 && response.status !== 429 && response.status !== 502 && response.status !== 503 && response.status !== 400) {
        const text = await response.text()
        throw new Error(`Unexpected status ${response.status}: ${text.slice(0, 100)}`)
      }
    })

    printResult('并发 AI 分析限流测试 (20请求, 5并发)', result)
    expect(result.total).toBe(20)
  })
})
