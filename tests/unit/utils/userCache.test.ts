import { describe, it, expect, beforeEach, vi } from 'vitest'

const storage: Record<string, string> = {}

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]) },
})

import { buildUserWithCache, clearUserCache, persistUser } from '../../../src/utils/userCache'
import type { User } from '../../../src/types/auth'

describe('userCache', () => {
  beforeEach(() => {
    Object.keys(storage).forEach((k) => delete storage[k])
    clearUserCache()
  })

  describe('buildUserWithCache', () => {
    const mockUser: User = {
      id: 'u1',
      username: 'test',
      email: 'test@example.com',
      role: 'user',
    }

    it('当用户没有头像时应从缓存补充头像', () => {
      persistUser({ ...mockUser, avatar: 'cached-avatar.png' })
      const result = buildUserWithCache({ ...mockUser, avatar: undefined })
      expect(result?.avatar).toBe('cached-avatar.png')
    })

    it('当用户已有头像时不应覆盖', () => {
      persistUser({ ...mockUser, avatar: 'cached-avatar.png' })
      const result = buildUserWithCache({ ...mockUser, avatar: 'new-avatar.png' })
      expect(result?.avatar).toBe('new-avatar.png')
    })

    it('不应修改原始传入的对象', () => {
      persistUser({ ...mockUser, avatar: 'cached-avatar.png' })
      const original: User = { ...mockUser, avatar: undefined }
      buildUserWithCache(original)
      expect(original.avatar).toBeUndefined()
    })

    it('传入 null 时应返回 null', () => {
      expect(buildUserWithCache(null)).toBeNull()
    })
  })
})
