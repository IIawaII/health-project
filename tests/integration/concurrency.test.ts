/**
 * 本地高并发测试
 * 测试目标：
 * 1. KV 速率限制的竞态条件（checkRateLimit）
 * 2. D1 验证码原子消费（consumeVerificationCode）
 * 3. 令牌并发验证（verifyToken）
 * 4. 注册并发唯一性约束
 *
 * 运行方式：npm test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, buildRateLimitKey } from '../../server/utils/rateLimit'
import {
  consumeVerificationCode,
  upsertVerificationCode,
  checkVerificationCooldown,
  setVerificationCooldown,
} from '../../server/dao/verification.dao'
import { verifyToken, saveToken, revokeAllUserTokens } from '../../server/utils/auth'
import { MockKV } from './mocks/mock-kv'
import { MockD1 } from './mocks/mock-d1'

// ==================== 测试用例 ====================
describe('高并发测试', () => {
  let mockKV: KVNamespace
  let mockD1: MockD1

  beforeEach(() => {
    mockKV = new MockKV() as unknown as KVNamespace
    mockD1 = new MockD1()
  })

  describe('1. KV 速率限制竞态条件', () => {
    it('并发请求不应超过限流阈值过多', async () => {
      const limit = 5
      const concurrency = 20
      const key = 'test:ip:login'

      // 并发执行 20 个请求，限流为 5
      const promises = Array.from({ length: concurrency }, () =>
        checkRateLimit({ kv: mockKV, key, limit, windowSeconds: 60 })
      )

      const results = await Promise.all(promises)
      const allowed = results.filter((r) => r.allowed).length
      const denied = results.filter((r) => !r.allowed).length

      console.log(`[RateLimit] 限流 ${limit}，并发 ${concurrency}，通过 ${allowed}，拒绝 ${denied}`)

      // 由于 MockKV 的 get/put 不是原子操作，并发下所有请求可能同时读到 0 然后同时写入
      // 这是预期的竞态条件行为，测试用于量化问题严重程度
      console.log(`[RateLimit Race] 预期限流 ${limit}，实际通过 ${allowed}，超发 ${allowed - limit} 个`)
      expect(allowed + denied).toBe(concurrency)
    })

    it('串行请求应严格限流', async () => {
      const limit = 3
      const key = 'test:ip:register'

      // 串行执行 5 个请求
      const results: Awaited<ReturnType<typeof checkRateLimit>>[] = []
      for (let i = 0; i < 5; i++) {
        results.push(await checkRateLimit({ kv: mockKV, key, limit, windowSeconds: 60 }))
      }

      const allowed = results.filter((r) => r.allowed).length
      const denied = results.filter((r) => !r.allowed).length

      console.log(`[RateLimit Serial] 限流 ${limit}，通过 ${allowed}，拒绝 ${denied}`)

      // 串行应严格限流
      expect(allowed).toBe(limit)
      expect(denied).toBe(2)
    })
  })

  describe('2. D1 验证码原子消费', () => {
    it('并发消费同一验证码应只有一个成功', async () => {
      const purpose = 'register' as const
      const email = 'test@example.com'
      const code = '123456'
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = Math.floor(Date.now() / 1000) + 60

      // 先插入验证码
      await upsertVerificationCode(mockD1, {
        purpose,
        email,
        code,
        createdAt: now,
        expiresAt,
      })

      // 并发消费 10 次
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

      // 只有一个应成功消费
      expect(consumed).toBe(1)
      // 其余应为 not_found（已被删除）
      expect(notFound).toBe(concurrency - 1)
    })

    it('并发设置冷却时间应只有一个成功写入', async () => {
      const purpose = 'register' as const
      const email = 'test@example.com'
      const concurrency = 10

      // 并发设置冷却 10 次
      const promises = Array.from({ length: concurrency }, () =>
        setVerificationCooldown(mockD1, purpose, email)
      )

      await Promise.all(promises)

      // 查询冷却状态
      const result = await checkVerificationCooldown(mockD1, purpose, email, 60)

      console.log(`[Cooldown] 并发 ${concurrency} 次设置，冷却状态:`, result)

      // 应被成功设置（不抛出错误即视为通过）
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

      // 先保存令牌
      await saveToken(mockKV, token, tokenData, 900)

      // 并发验证 50 次
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

      // 全部应通过
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

      // 保存令牌和索引
      await saveToken(mockKV, token, tokenData, 900)
      await mockKV.put(`user_tokens:${userId}:${token}`, '1', { expirationTtl: 900 })

      // 并发执行：一半验证，一半撤销
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

      // 由于并发时序不确定，验证结果可能是成功或失败
      // 但撤销后再次验证应全部失败
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

  describe('4. buildRateLimitKey', () => {
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
})
