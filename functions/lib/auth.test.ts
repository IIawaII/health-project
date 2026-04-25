import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  verifyToken,
  saveToken,
  saveRefreshToken,
  verifyRefreshToken,
  deleteToken,
  deleteRefreshToken,
  revokeAllUserTokens,
} from './auth'

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; ttl?: number }>()
  return {
    get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, { value, ttl: options?.expirationTtl })
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    list: vi.fn(async ({ prefix }: { prefix: string }) => {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }))
      return { keys, list_complete: true, cursor: '' }
    }),
  } as unknown as KVNamespace
}

describe('auth', () => {
  let kv: KVNamespace

  beforeEach(() => {
    kv = createMockKV()
  })

  describe('verifyToken', () => {
    it('should return token data for valid Bearer token', async () => {
      const tokenData = { userId: 'u1', username: 'test', email: 't@test.com', createdAt: '2024-01-01' }
      await saveToken(kv, 'valid-token', tokenData)
      const result = await verifyToken({
        request: new Request('http://localhost', { headers: { Authorization: 'Bearer valid-token' } }),
        env: { AUTH_TOKENS: kv },
      })
      expect(result).toEqual(tokenData)
    })

    it('should return null for missing Authorization header', async () => {
      const result = await verifyToken({
        request: new Request('http://localhost'),
        env: { AUTH_TOKENS: kv },
      })
      expect(result).toBeNull()
    })

    it('should return null for non-Bearer header', async () => {
      const result = await verifyToken({
        request: new Request('http://localhost', { headers: { Authorization: 'Basic abc' } }),
        env: { AUTH_TOKENS: kv },
      })
      expect(result).toBeNull()
    })

    it('should return null for expired/unknown token', async () => {
      const result = await verifyToken({
        request: new Request('http://localhost', { headers: { Authorization: 'Bearer unknown' } }),
        env: { AUTH_TOKENS: kv },
      })
      expect(result).toBeNull()
    })
  })

  describe('saveToken & deleteToken', () => {
    it('should save and delete access token with user index', async () => {
      const data = { userId: 'u1', username: 'test', email: 't@test.com', createdAt: '2024-01-01' }
      await saveToken(kv, 'tk1', data, 60)
      expect((kv.put as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)

      await deleteToken(kv, 'tk1')
      const afterDelete = await verifyToken({
        request: new Request('http://localhost', { headers: { Authorization: 'Bearer tk1' } }),
        env: { AUTH_TOKENS: kv },
      })
      expect(afterDelete).toBeNull()
    })
  })

  describe('saveRefreshToken & verifyRefreshToken', () => {
    it('should save and verify refresh token', async () => {
      const data = { userId: 'u1', username: 'test', email: 't@test.com', createdAt: '2024-01-01' }
      await saveRefreshToken(kv, 'rt1', data, 3600)
      const result = await verifyRefreshToken(kv, 'rt1')
      expect(result).toEqual(data)
    })

    it('should return null for unknown refresh token', async () => {
      const result = await verifyRefreshToken(kv, 'rt-unknown')
      expect(result).toBeNull()
    })
  })

  describe('deleteRefreshToken', () => {
    it('should delete refresh token and its index', async () => {
      const data = { userId: 'u1', username: 'test', email: 't@test.com', createdAt: '2024-01-01' }
      await saveRefreshToken(kv, 'rt2', data)
      await deleteRefreshToken(kv, 'rt2')
      const result = await verifyRefreshToken(kv, 'rt2')
      expect(result).toBeNull()
    })
  })

  describe('revokeAllUserTokens', () => {
    it('should revoke all access and refresh tokens for a user', async () => {
      const data = { userId: 'u1', username: 'test', email: 't@test.com', createdAt: '2024-01-01' }
      await saveToken(kv, 'atk1', data)
      await saveToken(kv, 'atk2', data)
      await saveRefreshToken(kv, 'rtk1', data)

      await revokeAllUserTokens(kv, 'u1')

      expect(await verifyToken({
        request: new Request('http://localhost', { headers: { Authorization: 'Bearer atk1' } }),
        env: { AUTH_TOKENS: kv },
      })).toBeNull()
      expect(await verifyToken({
        request: new Request('http://localhost', { headers: { Authorization: 'Bearer atk2' } }),
        env: { AUTH_TOKENS: kv },
      })).toBeNull()
      expect(await verifyRefreshToken(kv, 'rtk1')).toBeNull()
    })
  })
})
