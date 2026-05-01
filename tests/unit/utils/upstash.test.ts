import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  })),
}))

import { Redis } from '@upstash/redis'
import { createRedisClient, resetClients, checkRedisConnection } from '../../../server/utils/upstash'
import type { Env } from '../../../server/utils/env'

function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    DB: {} as D1Database,
    AUTH_TOKENS: {} as KVNamespace,
    VERIFICATION_CODES: {} as KVNamespace,
    UPSTASH_REST_URL: 'https://test.upstash.io',
    UPSTASH_REST_TOKEN: 'test-token-xxxx',
    ...overrides,
  } as Env
}

describe('upstash', () => {
  beforeEach(() => {
    resetClients()
    vi.clearAllMocks()
  })

  describe('createRedisClient', () => {
    it('should create Redis client with correct configuration', () => {
      const env = createMockEnv()
      const client = createRedisClient(env)
      expect(client).not.toBeNull()
      expect(Redis).toHaveBeenCalledWith({
        url: 'https://test.upstash.io',
        token: 'test-token-xxxx',
        enableTelemetry: false,
      })
    })

    it('should return cached instance on subsequent calls', () => {
      const env = createMockEnv()
      const client1 = createRedisClient(env)
      const client2 = createRedisClient(env)
      expect(client1).toBe(client2)
      expect(Redis).toHaveBeenCalledTimes(1)
    })
  })

  describe('checkRedisConnection', () => {
    it('should return true when ping succeeds', async () => {
      const env = createMockEnv()
      const result = await checkRedisConnection(env)
      expect(result).toBe(true)
    })

    it('should return false when ping throws', async () => {
      const MockedRedis = vi.mocked(Redis)
      MockedRedis.mockImplementationOnce(() => ({
        ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
      }) as unknown as InstanceType<typeof Redis>)
      resetClients()

      const env = createMockEnv()
      const result = await checkRedisConnection(env)
      expect(result).toBe(false)
    })
  })

  describe('resetClients', () => {
    it('should clear cached Redis instance', () => {
      const env = createMockEnv()
      createRedisClient(env)

      resetClients()

      createRedisClient(env)
      expect(Redis).toHaveBeenCalledTimes(2)
    })
  })
})
