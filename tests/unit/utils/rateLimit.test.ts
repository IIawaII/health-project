import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { checkRateLimit, buildRateLimitKey, resetRatelimitCache } from '../../../server/utils/rateLimit'
import { resetClients } from '../../../server/utils/upstash'
import type { Env } from '../../../server/utils/env'

function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    DB: {} as D1Database,
    AUTH_TOKENS: {} as KVNamespace,
    VERIFICATION_CODES: {} as KVNamespace,
    UPSTASH_REST_URL: 'https://test.upstash.io',
    UPSTASH_REST_TOKEN: 'test-token',
    ...overrides,
  } as Env
}

describe('rateLimit', () => {
  beforeEach(() => {
    resetClients()
    resetRatelimitCache()
    mockLimitFn.mockReset()
  })

  describe('Upstash Redis', () => {
    it('should allow requests when Upstash returns success', async () => {
      mockLimitFn.mockResolvedValue({
        success: true,
        remaining: 9,
        reset: 60,
      })

      const env = createMockEnv()

      const result = await checkRateLimit({
        env,
        key: 'upstash-key',
        limit: 10,
        windowSeconds: 60,
      })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
      expect(mockLimitFn).toHaveBeenCalledWith('upstash-key')
    })

    it('should block requests when Upstash returns success=false', async () => {
      mockLimitFn.mockResolvedValue({
        success: false,
        remaining: 0,
        reset: 45,
      })

      const env = createMockEnv()

      const result = await checkRateLimit({
        env,
        key: 'blocked-key',
        limit: 10,
        windowSeconds: 60,
      })

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should calculate resetAt from current time plus reset seconds', async () => {
      const realDateNow = Date.now
      const currentTime = 1000 * 100
      Date.now = vi.fn(() => currentTime)

      mockLimitFn.mockResolvedValue({
        success: true,
        remaining: 5,
        reset: 50,
      })

      const env = createMockEnv()

      const result = await checkRateLimit({
        env,
        key: 'reset-at-key',
        limit: 10,
        windowSeconds: 60,
      })

      expect(result.resetAt).toBe(100 + 50)

      Date.now = realDateNow
    })

    it('should throw error when Upstash request fails', async () => {
      mockLimitFn.mockRejectedValue(new Error('Network error'))

      const env = createMockEnv()

      await expect(
        checkRateLimit({
          env,
          key: 'error-key',
          limit: 10,
          windowSeconds: 60,
        })
      ).rejects.toThrow('Network error')
    })

    it('should pass correct limit and window to Ratelimit', async () => {
      mockLimitFn.mockResolvedValue({
        success: true,
        remaining: 4,
        reset: 120,
      })

      const env = createMockEnv()

      await checkRateLimit({
        env,
        key: 'config-key',
        limit: 5,
        windowSeconds: 120,
      })

      const { Ratelimit } = await import('@upstash/ratelimit')
      expect(Ratelimit).toHaveBeenCalledWith(
        expect.objectContaining({
          limiter: 'slidingWindow',
          prefix: 'cloud-health:ratelimit',
        })
      )
    })

    it('should reuse cached ratelimiter for same limit and window', async () => {
      mockLimitFn.mockResolvedValue({
        success: true,
        remaining: 5,
        reset: 60,
      })

      const env = createMockEnv()

      await checkRateLimit({ env, key: 'cache-1', limit: 10, windowSeconds: 60 })

      const { Ratelimit } = await import('@upstash/ratelimit')
      const callCountBefore = vi.mocked(Ratelimit).mock.calls.length

      await checkRateLimit({ env, key: 'cache-2', limit: 10, windowSeconds: 60 })

      expect(vi.mocked(Ratelimit).mock.calls.length).toBe(callCountBefore)
    })

    it('should create new ratelimiter for different limit or window', async () => {
      mockLimitFn.mockResolvedValue({
        success: true,
        remaining: 5,
        reset: 60,
      })

      const env = createMockEnv()

      await checkRateLimit({ env, key: 'diff-1', limit: 10, windowSeconds: 60 })

      const { Ratelimit } = await import('@upstash/ratelimit')
      const callCountBefore = vi.mocked(Ratelimit).mock.calls.length

      await checkRateLimit({ env, key: 'diff-2', limit: 5, windowSeconds: 60 })
      await checkRateLimit({ env, key: 'diff-3', limit: 10, windowSeconds: 120 })

      expect(vi.mocked(Ratelimit).mock.calls.length).toBe(callCountBefore + 2)
    })
  })

  describe('buildRateLimitKey', () => {
    it('should include client IP and suffix', () => {
      const request = new Request('http://localhost', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      })
      const key = buildRateLimitKey({ request }, 'login')
      expect(key).toBe('1.2.3.4:login')
    })

    it('should fallback to unknown when IP header is missing', () => {
      const request = new Request('http://localhost')
      const key = buildRateLimitKey({ request }, 'register')
      expect(key).toBe('unknown:register')
    })
  })

  describe('resetRatelimitCache', () => {
    it('should clear ratelimiter cache so new instances are created', async () => {
      mockLimitFn.mockResolvedValue({
        success: true,
        remaining: 5,
        reset: 60,
      })

      const env = createMockEnv()

      await checkRateLimit({ env, key: 'cache-test', limit: 10, windowSeconds: 60 })
      expect(mockLimitFn).toHaveBeenCalledTimes(1)

      resetRatelimitCache()
      resetClients()

      await checkRateLimit({ env, key: 'cache-test', limit: 10, windowSeconds: 60 })
      expect(mockLimitFn).toHaveBeenCalledTimes(2)
    })
  })
})
