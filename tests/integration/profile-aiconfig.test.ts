import { describe, it, expect, beforeEach } from 'vitest'
import { saveToken } from '../../server/utils/auth'
import { onRequestPost as updateProfileHandler } from '../../server/api/auth/updateProfile'
import { onRequestGet as aiConfigGet, onRequestPut as aiConfigPut, onRequestDelete as aiConfigDelete } from '../../server/api/auth/ai-config'
import { MockD1 } from './mocks/mock-d1'
import { MockKV } from './mocks/mock-kv'

function createMockContext(
  kv: KVNamespace,
  db: MockD1,
  options?: {
    userToken?: string
    request?: Request
  }
) {
  const token = options?.userToken || ''
  const rawRequest = options?.request || new Request('http://localhost', {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  return {
    req: {
      raw: rawRequest,
      header: (name: string) => rawRequest.headers.get(name) || undefined,
      json: async <T>() => rawRequest.json() as Promise<T>,
      url: rawRequest.url,
      param: (_name?: string) => undefined,
    },
    env: {
      DB: db,
      AUTH_TOKENS: kv,
    },
  } as unknown as import('../../server/utils/handler').AppContext
}

function seedUser(db: MockD1, overrides: Partial<Record<string, unknown>> = {}) {
  const ts = Math.floor(Date.now() / 1000)
  const user = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    password_hash: 'hash1',
    avatar: null,
    accountname: null,
    role: 'user',
    data_key: 'dk-123',
    created_at: ts,
    updated_at: ts,
    ...overrides,
  }
  db.getTable('users').set(user.id, user)
  return user
}

describe('updateProfile', () => {
  let kv: KVNamespace
  let db: MockD1

  beforeEach(() => {
    kv = new MockKV() as unknown as KVNamespace
    db = new MockD1()
  })

  async function setupUserToken(userId = 'user-1') {
    const tokenData = { userId, username: 'testuser', email: 'test@example.com', role: 'user' as const, createdAt: '2024-01-01' }
    await saveToken(kv, 'user-token', tokenData)
    return tokenData
  }

  it('未登录应返回 401', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newname' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(401)
  })

  it('用户不存在应返回 404', async () => {
    await setupUserToken()
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newname' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(404)
  })

  it('更新用户名应成功', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newname' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean; user: { username: string } }
    expect(data.success).toBe(true)
    expect(data.user.username).toBe('newname')
  })

  it('用户名格式不合法应返回 400', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ab' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(400)
  })

  it('用户名包含非法字符应返回 400', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bad name!' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(400)
  })

  it('修改邮箱未提供验证码应返回 400', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(400)
  })

  it('更新头像应成功', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: 'User_5' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean; user: { avatar: string } }
    expect(data.success).toBe(true)
    expect(data.user.avatar).toBe('User_5')
  })

  it('头像格式不合法应返回 400', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: 'InvalidAvatar' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(400)
  })

  it('头像为空字符串应返回 400', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: '' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(400)
  })

  it('更新 accountname 应成功', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountname: '小明' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean; user: { accountname: string } }
    expect(data.success).toBe(true)
    expect(data.user.accountname).toBe('小明')
  })

  it('accountname 超过 20 字符应返回 400', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountname: 'a'.repeat(21) }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(400)
  })

  it('无更新字段时仍应返回 200', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('用户名与当前相同时不应触发更新', async () => {
    await setupUserToken()
    seedUser(db)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser' }),
    })
    const context = createMockContext(kv, db, { request })
    const response = await updateProfileHandler(context)
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean; user: { username: string } }
    expect(data.user.username).toBe('testuser')
  })
})

describe('ai-config', () => {
  let kv: KVNamespace
  let db: MockD1

  beforeEach(() => {
    kv = new MockKV() as unknown as KVNamespace
    db = new MockD1()
  })

  async function setupUserToken(userId = 'user-1') {
    const tokenData = { userId, username: 'testuser', email: 'test@example.com', role: 'user' as const, createdAt: '2024-01-01' }
    await saveToken(kv, 'user-token', tokenData)
    return tokenData
  }

  describe('GET /api/auth/ai-config', () => {
    it('未登录应返回 401', async () => {
      const context = createMockContext(kv, db)
      const response = await aiConfigGet(context)
      expect(response.status).toBe(401)
    })

    it('无配置时应返回 data 为 null', async () => {
      await setupUserToken()
      seedUser(db)

      const request = new Request('http://localhost', {
        method: 'GET',
        headers: { Authorization: 'Bearer user-token' },
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigGet(context)
      expect(response.status).toBe(200)
      const data = await response.json() as { success: boolean; data: unknown }
      expect(data.success).toBe(true)
      expect(data.data).toBeNull()
    })

    it('有配置时应返回加密数据', async () => {
      await setupUserToken()
      seedUser(db)

      const now = Math.floor(Date.now() / 1000)
      db.getTable('user_ai_configs').set('user-1', {
        user_id: 'user-1',
        encrypted_config: 'enc-data-xyz',
        config_iv: 'iv-abc',
        updated_at: now,
      })

      const request = new Request('http://localhost', {
        method: 'GET',
        headers: { Authorization: 'Bearer user-token' },
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigGet(context)
      expect(response.status).toBe(200)
      const data = await response.json() as { success: boolean; data: { encryptedConfig: string; configIv: string } }
      expect(data.success).toBe(true)
      expect(data.data.encryptedConfig).toBe('enc-data-xyz')
      expect(data.data.configIv).toBe('iv-abc')
    })
  })

  describe('PUT /api/auth/ai-config', () => {
    it('未登录应返回 401', async () => {
      const request = new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedConfig: 'enc', configIv: 'iv' }),
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigPut(context)
      expect(response.status).toBe(401)
    })

    it('参数缺失应返回 400', async () => {
      await setupUserToken()
      seedUser(db)

      const request = new Request('http://localhost', {
        method: 'PUT',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedConfig: '' }),
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigPut(context)
      expect(response.status).toBe(400)
    })

    it('用户无 data_key 应返回 400', async () => {
      await setupUserToken()
      seedUser(db, { data_key: null })

      const request = new Request('http://localhost', {
        method: 'PUT',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedConfig: 'enc-data', configIv: 'iv-data' }),
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigPut(context)
      expect(response.status).toBe(400)
    })

    it('有效请求应保存成功', async () => {
      await setupUserToken()
      seedUser(db)

      const request = new Request('http://localhost', {
        method: 'PUT',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedConfig: 'enc-data', configIv: 'iv-data' }),
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigPut(context)
      expect(response.status).toBe(200)
      const data = await response.json() as { success: boolean; message: string }
      expect(data.success).toBe(true)
    })
  })

  describe('DELETE /api/auth/ai-config', () => {
    it('未登录应返回 401', async () => {
      const request = new Request('http://localhost', {
        method: 'DELETE',
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigDelete(context)
      expect(response.status).toBe(401)
    })

    it('已登录应能删除配置', async () => {
      await setupUserToken()
      seedUser(db)

      db.getTable('user_ai_configs').set('user-1', {
        user_id: 'user-1',
        encrypted_config: 'old-enc',
        config_iv: 'old-iv',
        updated_at: Math.floor(Date.now() / 1000),
      })

      const request = new Request('http://localhost', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer user-token' },
      })
      const context = createMockContext(kv, db, { request })
      const response = await aiConfigDelete(context)
      expect(response.status).toBe(200)
      const data = await response.json() as { success: boolean; message: string }
      expect(data.success).toBe(true)
    })
  })
})
