import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateLimit, buildRateLimitKey } from '../../server/utils/rateLimit'

function createMockKV(): KVNamespace {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
  } as unknown as KVNamespace
}

describe('rateLimit', () => {
  let kv: KVNamespace

  beforeEach(() => {
    kv = createMockKV()
  })

  it('should allow requests under the limit', async () => {
    const result = await checkRateLimit({
      kv,
      key: 'test-key',
      limit: 3,
      windowSeconds: 60,
    })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('should block requests over the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ kv, key: 'test-key', limit: 3, windowSeconds: 60 })
    }
    const result = await checkRateLimit({
      kv,
      key: 'test-key',
      limit: 3,
      windowSeconds: 60,
    })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('should reset after window expires', async () => {
    const realDateNow = Date.now
    let currentTime = 1000 * 60 // 1 minute
    Date.now = vi.fn(() => currentTime)

    await checkRateLimit({ kv, key: 'window-key', limit: 1, windowSeconds: 60 })
    const blocked = await checkRateLimit({ kv, key: 'window-key', limit: 1, windowSeconds: 60 })
    expect(blocked.allowed).toBe(false)

    // Move to next window
    currentTime = 1000 * 120 // 2 minutes
    const allowed = await checkRateLimit({ kv, key: 'window-key', limit: 1, windowSeconds: 60 })
    expect(allowed.allowed).toBe(true)

    Date.now = realDateNow
  })

  it('buildRateLimitKey should include client IP and suffix', () => {
    const request = new Request('http://localhost', {
      headers: { 'CF-Connecting-IP': '1.2.3.4' },
    })
    const key = buildRateLimitKey({ request }, 'login')
    expect(key).toBe('1.2.3.4:login')
  })

  it('buildRateLimitKey should fallback to unknown', () => {
    const request = new Request('http://localhost')
    const key = buildRateLimitKey({ request }, 'register')
    expect(key).toBe('unknown:register')
  })
})
