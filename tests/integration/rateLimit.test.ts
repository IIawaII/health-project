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

import { checkRateLimit, buildRateLimitKey } from '../../server/utils/rateLimit'
import { resetClients } from '../../server/utils/upstash'
import type { Env } from '../../server/utils/env'

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

describe('rateLimit integration', () => {
  beforeEach(() => {
    resetClients()
    mockLimitFn.mockReset()
  })

  describe('Upstash Redis', () => {
    it('should return allowed result when Upstash returns success', async () => {
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
    })

    it('should return blocked result when Upstash returns success=false', async () => {
      mockLimitFn.mockResolvedValue({
        success: false,
        remaining: 0,
        reset: 30,
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

    it('should throw error when Upstash request fails', async () => {
      mockLimitFn.mockRejectedValue(new Error('Connection failed'))

      const env = createMockEnv()

      await expect(
        checkRateLimit({
          env,
          key: 'error-key',
          limit: 10,
          windowSeconds: 60,
        })
      ).rejects.toThrow('Connection failed')
    })

    it('should pass correct key to Upstash limit function', async () => {
      mockLimitFn.mockResolvedValue({
        success: true,
        remaining: 5,
        reset: 60,
      })

      const env = createMockEnv()

      await checkRateLimit({
        env,
        key: '192.168.1.1:login',
        limit: 10,
        windowSeconds: 60,
      })

      expect(mockLimitFn).toHaveBeenCalledWith('192.168.1.1:login')
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

    it('should fallback to unknown', () => {
      const request = new Request('http://localhost')
      const key = buildRateLimitKey({ request }, 'register')
      expect(key).toBe('unknown:register')
    })
  })
})
