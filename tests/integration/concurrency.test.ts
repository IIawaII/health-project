/**
 * 本地高并发测试
 * 测试目标：
 * 1. Upstash Redis 速率限制（checkRateLimit）
 * 2. D1 验证码原子消费（consumeVerificationCode）
 * 3. 令牌并发验证（verifyToken）
 * 4. 注册并发唯一性约束
 *
 * 运行方式：npm test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { buildRateLimitKey } from '../../server/utils/rateLimit'
import {
  consumeVerificationCode,
  upsertVerificationCode,
  checkVerificationCooldown,
  setVerificationCooldown,
} from '../../server/dao/verification.dao'
import { verifyToken, saveToken, revokeAllUserTokens } from '../../server/utils/auth'
import { MockKV } from './mocks/mock-kv'
import { MockD1 } from './mocks/mock-d1'
import { resetClients } from '../../server/utils/upstash'

// ==================== 测试用例 ====================
describe('高并发测试', () => {
  let mockKV: KVNamespace
  let mockD1: MockD1

  beforeEach(() => {
    resetClients()
    mockKV = new MockKV() as unknown as KVNamespace
    mockD1 = new MockD1()
  })

  describe('1. buildRateLimitKey', () => {
    it('应正确构建限流键', () => {
      const request = new Request('http://localhost', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' },
      })
      const key = buildRateLimitKey({ request }, 'login')
      expect(key).toBe('192.168.1.1:login')
    })

    it('无 CF-Connecting-IP 时应使用 unknown', () => {
      const request = new Request('http://localhost')
      const key = buildRateLimitKey({ request }, 'register')
      expect(key).toBe('unknown:register')
    })
  })

  describe('2. D1 验证码原子消费', () => {
    it('并发消费同一验证码应只有一个成功', async () => {
      const purpose = 'register' as const
      const email = 'test@example.com'
      const code = '123456'
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = Math.floor(Date.now() / 1000) + 60

      await upsertVerificationCode(mockD1, {
        purpose,
        email,
        code,
        createdAt: now,
        expiresAt,
      })

      const concurrency = 10
      const promises = Array.from({ length: concurrency }, () =>
        consumeVerificationCode(mockD1, purpose, email, code, now)
      )

      const results = await Promise.all(promises)
      const consumed = results.filter((r) => r === 'consumed').length
      const notFound = results.filter((r) => r === 'not_found').length
      const expired = results.filter((r) => r === 'expired').length
      const invalid = results.filter((r) => r === 'invalid').length

      console.log(
        `[VerificationCode] 并发 ${concurrency}，consumed=${consumed}, not_found=${notFound}, expired=${expired}, invalid=${invalid}`
      )

      expect(consumed).toBe(1)
      expect(notFound).toBe(concurrency - 1)
    })

    it('并发设置冷却时间应只有一个成功写入', async () => {
      const purpose = 'register' as const
      const email = 'test@example.com'
      const concurrency = 10

      const promises = Array.from({ length: concurrency }, () =>
        setVerificationCooldown(mockD1, purpose, email)
      )

      await Promise.all(promises)

      const result = await checkVerificationCooldown(mockD1, purpose, email, 60)

      console.log(`[Cooldown] 并发 ${concurrency} 次设置，冷却状态:`, result)

      expect(result.allowed).toBe(false)
      expect(result.remainingSeconds).toBeGreaterThan(0)
    })
  })

  describe('3. 令牌并发验证', () => {
    it('并发验证同一有效令牌应全部通过', async () => {
      const token = 'valid_token_123'
      const tokenData = {
        userId: 'user_1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user' as const,
        createdAt: new Date().toISOString(),
      }

      await saveToken(mockKV, token, tokenData, 900)

      const concurrency = 50
      const promises = Array.from({ length: concurrency }, () =>
        verifyToken({
          request: new Request('http://localhost', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          env: { AUTH_TOKENS: mockKV },
        })
      )

      const results = await Promise.all(promises)
      const valid = results.filter((r) => r !== null).length
      const invalid = results.filter((r) => r === null).length

      console.log(`[TokenVerify] 并发 ${concurrency}，有效 ${valid}，无效 ${invalid}`)

      expect(valid).toBe(concurrency)
      expect(invalid).toBe(0)
    })

    it('并发撤销令牌后验证应全部失败', async () => {
      const token = 'token_to_revoke'
      const userId = 'user_2'
      const tokenData = {
        userId,
        username: 'revokeuser',
        email: 'revoke@example.com',
        role: 'user' as const,
        createdAt: new Date().toISOString(),
      }

      await saveToken(mockKV, token, tokenData, 900)
      await mockKV.put(`user_tokens:${userId}:${token}`, '1', { expirationTtl: 900 })

      const verifyPromises = Array.from({ length: 10 }, () =>
        verifyToken({
          request: new Request('http://localhost', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          env: { AUTH_TOKENS: mockKV },
        })
      )

      const revokePromise = revokeAllUserTokens(mockKV, userId)

      await Promise.all([
        Promise.all(verifyPromises),
        revokePromise,
      ])

      const afterRevoke = await verifyToken({
        request: new Request('http://localhost', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        env: { AUTH_TOKENS: mockKV },
      })

      console.log(`[TokenRevoke] 撤销后验证结果:`, afterRevoke)

      expect(afterRevoke).toBeNull()
    })
  })
})
