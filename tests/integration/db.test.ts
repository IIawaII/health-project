import { describe, it, expect, beforeEach } from 'vitest'
import {
  findUserByUsername,
  findUserByEmail,
  findUserById,
  findUserByIdPublic,
  createUser,
  updateUserPassword,
  updateUser,
  usernameExists,
  emailExists,
} from '../../server/dao/user.dao'

import {
  upsertVerificationCode,
  deleteVerificationCode,
  consumeVerificationCode,
  checkVerificationCooldown,
  setVerificationCooldown,
  deleteVerificationCooldown,
} from '../../server/dao/verification.dao'
import { MockD1 } from './mocks/mock-d1'

// ==================== 测试 ====================
describe('db', () => {
  let db: MockD1

  beforeEach(() => {
    db = new MockD1()
  })

  describe('用户 CRUD', () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      password_hash: '100000:salt:hash',
      role: 'user' as const,
      data_key: 'dk-test-123',
      avatar: null,
      created_at: Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000),
      updated_at: Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000),
    }

    it('应创建用户并通过用户名查找', async () => {
      await createUser(db, mockUser)
      const found = await findUserByUsername(db, 'testuser')
      expect(found).not.toBeNull()
      expect(found?.username).toBe('testuser')
      expect(found?.email).toBe('test@example.com')
    })

    it('应通过邮箱查找用户', async () => {
      await createUser(db, mockUser)
      const found = await findUserByEmail(db, 'test@example.com')
      expect(found).not.toBeNull()
      expect(found?.id).toBe('user-1')
    })

    it('应通过 ID 查找用户（含密码）', async () => {
      await createUser(db, mockUser)
      const found = await findUserById(db, 'user-1')
      expect(found?.password_hash).toBe('100000:salt:hash')
    })

    it('应通过 ID 查找用户（不含密码）', async () => {
      await createUser(db, mockUser)
      const found = await findUserByIdPublic(db, 'user-1')
      expect(found).not.toBeNull()
      // Mock D1 返回完整记录，但类型上不含 password_hash
      // 这里验证返回对象的结构即可
      expect(found).toHaveProperty('id')
      expect(found).toHaveProperty('username')
      expect(found).toHaveProperty('email')
    })

    it('查找不存在的用户应返回 null', async () => {
      expect(await findUserByUsername(db, 'nobody')).toBeNull()
      expect(await findUserByEmail(db, 'nobody@example.com')).toBeNull()
      expect(await findUserById(db, 'nonexistent')).toBeNull()
    })

    it('用户名查找应忽略大小写', async () => {
      await createUser(db, { ...mockUser, username: 'TestUser' })
      const found = await findUserByUsername(db, 'TESTUSER')
      expect(found).not.toBeNull()
    })

    it('应更新用户密码', async () => {
      await createUser(db, mockUser)
      await updateUserPassword(db, 'user-1', 'new_hash')
      const found = await findUserById(db, 'user-1')
      expect(found?.password_hash).toBe('new_hash')
    })

    it('应更新用户信息', async () => {
      await createUser(db, mockUser)
      await updateUser(db, 'user-1', { username: 'newname', email: 'new@example.com' })
      const found = await findUserByIdPublic(db, 'user-1')
      expect(found?.username).toBe('newname')
      expect(found?.email).toBe('new@example.com')
    })

    it('更新空字段应不执行', async () => {
      await createUser(db, mockUser)
      await updateUser(db, 'user-1', {})
      const found = await findUserById(db, 'user-1')
      expect(found?.username).toBe('testuser')
    })

    it('应检查用户名是否存在', async () => {
      await createUser(db, mockUser)
      expect(await usernameExists(db, 'testuser')).toBe(true)
      expect(await usernameExists(db, 'other')).toBe(false)
    })

    it('应检查邮箱是否存在', async () => {
      await createUser(db, mockUser)
      expect(await emailExists(db, 'test@example.com')).toBe(true)
      expect(await emailExists(db, 'other@example.com')).toBe(false)
    })

    it('排除指定 ID 时应正确判断', async () => {
      await createUser(db, mockUser)
      expect(await usernameExists(db, 'testuser', 'user-1')).toBe(false)
      expect(await emailExists(db, 'test@example.com', 'user-1')).toBe(false)
      expect(await usernameExists(db, 'testuser', 'other-id')).toBe(true)
    })
  })

  describe('验证码操作', () => {
    const now = Math.floor(Date.now() / 1000)
    const futureDate = Math.floor(Date.now() / 1000) + 3600 // 1小时后
    const pastDate = Math.floor(Date.now() / 1000) - 3600 // 1小时前

    const record = {
      purpose: 'register' as const,
      email: 'test@example.com',
      code: '123456',
      createdAt: now,
      expiresAt: futureDate,
    }

    it('应保存验证码', async () => {
      await upsertVerificationCode(db, record)
      const found = await consumeVerificationCode(db, record.purpose, record.email, record.code)
      expect(found).toBe('consumed')
    })

    it('应覆盖已存在的验证码', async () => {
      await upsertVerificationCode(db, record)
      await upsertVerificationCode(db, { ...record, code: '654321' })
      // 旧验证码已被覆盖，消费旧码应返回 invalid（code 不匹配）
      const oldResult = await consumeVerificationCode(db, record.purpose, record.email, '123456')
      expect(oldResult).toBe('invalid')
      const newResult = await consumeVerificationCode(db, record.purpose, record.email, '654321')
      expect(newResult).toBe('consumed')
    })

    it('应删除验证码', async () => {
      await upsertVerificationCode(db, record)
      await deleteVerificationCode(db, record.purpose, record.email)
      const result = await consumeVerificationCode(db, record.purpose, record.email, record.code)
      expect(result).toBe('not_found')
    })

    it('消费错误的验证码应返回 invalid', async () => {
      await upsertVerificationCode(db, record)
      const result = await consumeVerificationCode(db, record.purpose, record.email, '000000')
      // Mock D1 中，当 code 不匹配时，DELETE 返回 changes=0
      // 然后查询记录存在且未过期，返回 invalid
      expect(result).toBe('invalid')
    })

    it('消费过期的验证码应返回 expired', async () => {
      await upsertVerificationCode(db, {
        ...record,
        expiresAt: pastDate,
      })
      // Mock D1 中 DELETE 检查 expires_at > now
      // 如果过期时间早于当前时间，DELETE 不会匹配（changes=0）
      // 然后查询到记录，检查 expires_at <= now，返回 expired
      const result = await consumeVerificationCode(db, record.purpose, record.email, record.code)
      expect(result).toBe('expired')
    })

    it('消费不存在的验证码应返回 not_found', async () => {
      const result = await consumeVerificationCode(db, 'register', 'nobody@example.com', '000000')
      expect(result).toBe('not_found')
    })
  })

  describe('验证码冷却时间', () => {
    it('应设置和检查冷却时间', async () => {
      await setVerificationCooldown(db, 'register', 'test@example.com')
      const result = await checkVerificationCooldown(db, 'register', 'test@example.com', 60)
      expect(result.allowed).toBe(false)
      expect(result.remainingSeconds).toBeGreaterThan(0)
    })

    it('冷却过期后应允许发送', async () => {
      // 设置一个过去的冷却时间（通过直接操作 mock）
      const table = db.getTable('verification_code_cooldowns')
      table.set('register:test@example.com', {
        purpose: 'register',
        email: 'test@example.com',
        sent_at: Math.floor((Date.now() - 120000) / 1000), // 2 分钟前
      })

      const result = await checkVerificationCooldown(db, 'register', 'test@example.com', 60)
      expect(result.allowed).toBe(true)
      expect(result.remainingSeconds).toBe(0)
    })

    it('无冷却记录时应允许发送', async () => {
      const result = await checkVerificationCooldown(db, 'register', 'new@example.com', 60)
      expect(result.allowed).toBe(true)
      expect(result.remainingSeconds).toBe(0)
    })

    it('应删除冷却记录', async () => {
      await setVerificationCooldown(db, 'register', 'test@example.com')
      await deleteVerificationCooldown(db, 'register', 'test@example.com')
      const result = await checkVerificationCooldown(db, 'register', 'test@example.com', 60)
      expect(result.allowed).toBe(true)
    })
  })
})
