import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyTurnstile, validateTurnstile } from '../../server/utils/turnstile'
import type { Env } from '../../server/utils/env'
import type { AppContext } from '../../server/utils/handler'

// 保存原始 fetch
declare const globalThis: { fetch: typeof fetch }
const originalFetch = globalThis.fetch

describe('turnstile', () => {
  beforeEach(() => {
    // 清空内部缓存
    // @ts-expect-error 访问私有变量进行测试
    const cache = verifyTurnstile.__cache || new Map()
    if (cache.clear) cache.clear()
  })

  it('应缓存成功的验证结果', async () => {
    let fetchCount = 0
    globalThis.fetch = vi.fn(async () => {
      fetchCount++
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as unknown as typeof fetch

    // 第一次调用
    const result1 = await verifyTurnstile('token-1', 'secret')
    expect(result1.success).toBe(true)
    expect(fetchCount).toBe(1)

    // 第二次调用相同 token，应使用缓存
    const result2 = await verifyTurnstile('token-1', 'secret')
    expect(result2.success).toBe(true)
    expect(fetchCount).toBe(1) // 不应再调用 fetch

    globalThis.fetch = originalFetch
  })

  it('应缓存失败的验证结果', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }), { status: 200 })
    }) as unknown as typeof fetch

    const result1 = await verifyTurnstile('token-fail', 'secret')
    expect(result1.success).toBe(false)
    expect(result1.error).toBe('timeout-or-duplicate')

    // 再次调用应使用缓存
    const result2 = await verifyTurnstile('token-fail', 'secret')
    expect(result2.success).toBe(false)

    globalThis.fetch = originalFetch
  })

  it('网络错误时应返回失败', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error')
    }) as unknown as typeof fetch

    const result = await verifyTurnstile('token-net', 'secret')
    expect(result.success).toBe(false)
    expect(result.error).toBe('网络错误')

    globalThis.fetch = originalFetch
  })

  it('应传递 IP 地址', async () => {
    let capturedBody: URLSearchParams | null = null
    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = new URLSearchParams(String((init as RequestInit | undefined)?.body))
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as unknown as typeof fetch

    await verifyTurnstile('token-ip', 'secret', '192.168.1.1')
    expect((capturedBody as URLSearchParams | null)?.get('remoteip')).toBe('192.168.1.1')

    globalThis.fetch = originalFetch
  })

  it('validateTurnstile 应返回 null 当验证通过', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as unknown as typeof fetch

    const mockContext = {
      req: {
        raw: new Request('http://localhost', {
          headers: { 'CF-Connecting-IP': '1.2.3.4' },
        }),
        header: (name: string) => new Request('http://localhost', {
          headers: { 'CF-Connecting-IP': '1.2.3.4' },
        }).headers.get(name) || undefined,
      },
      env: { TURNSTILE_SECRET_KEY: 'test-secret' } as Env,
    } as unknown as AppContext

    const result = await validateTurnstile(mockContext, 'valid-token')
    expect(result).toBeNull()

    globalThis.fetch = originalFetch
  })

  it('validateTurnstile 应返回错误信息当验证失败', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 })
    }) as unknown as typeof fetch

    const mockContext = {
      req: {
        raw: new Request('http://localhost'),
        header: (_name: string) => undefined,
      },
      env: { TURNSTILE_SECRET_KEY: 'test-secret' } as Env,
    } as unknown as AppContext

    const result = await validateTurnstile(mockContext, 'invalid-token')
    expect(result).toContain('人机验证失败')
    expect(result).toContain('invalid-input-response')

    globalThis.fetch = originalFetch
  })

  it('validateTurnstile 无错误码时应返回默认错误', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ success: false }), { status: 200 })
    }) as unknown as typeof fetch

    const mockContext = {
      req: {
        raw: new Request('http://localhost'),
        header: (_name: string) => undefined,
      },
      env: { TURNSTILE_SECRET_KEY: 'test-secret' } as Env,
    } as unknown as AppContext

    const result = await validateTurnstile(mockContext, 'fail-token')
    expect(result).toBe('人机验证失败，请重试')

    globalThis.fetch = originalFetch
  })
})
