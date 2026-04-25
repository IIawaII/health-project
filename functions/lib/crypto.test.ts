import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateToken } from './crypto'

describe('crypto', () => {
  it('should hash and verify password correctly', async () => {
    const password = 'Test1234!'
    const hash = await hashPassword(password)
    expect(hash).toContain(':')
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('should reject invalid hash format', async () => {
    expect(await verifyPassword('test', 'invalid')).toBe(false)
    expect(await verifyPassword('test', 'abc:def')).toBe(false)
    expect(await verifyPassword('test', '1000:abc')).toBe(false)
  })

  it('should generate unique tokens', () => {
    const t1 = generateToken()
    const t2 = generateToken()
    expect(t1).not.toBe(t2)
    expect(t1.length).toBe(64)
  })
})
