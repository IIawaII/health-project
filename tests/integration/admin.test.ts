import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveToken } from '../../server/utils/auth'
import {
  requireAdmin,
  withAdmin,
} from '../../server/middleware/admin'
import {
  getUserList,
  findUserByIdPublic,
  updateUserRole,
  deleteUserById,
  getDailyUserStats,
} from '../../server/dao/user.dao'

import {
  getUsageLogs,
  createUsageLog,
  getStats,
  getUsageStats,
} from '../../server/dao/log.dao'

import {
  getAuditLogs,
  createAuditLog,
} from '../../server/dao/audit.dao'

import {
  getAllSystemConfigs,
  getSystemConfig,
  setSystemConfig,
} from '../../server/dao/config.dao'
import {
  onRequestGet as apiGetUserList,
  onRequestPatch as apiUpdateUserRole,
  onRequestDelete as apiDeleteUserById,
} from '../../server/api/admin/users'
import { onRequestGet as statsHandler } from '../../server/api/admin/stats'
import { onRequestGet as logsHandler } from '../../server/api/admin/logs'
import { onRequestGet as configGetHandler } from '../../server/api/admin/config'
import { onRequestPut as configPutHandler } from '../../server/api/admin/config'
import { MockD1 } from './mocks/mock-d1'
import { MockKV } from './mocks/mock-kv'

// ==================== 辅助函数 ====================
function createMockContext(
  kv: KVNamespace,
  db: MockD1,
  options?: {
    adminToken?: string
    userToken?: string
    request?: Request
    params?: Record<string, string>
  } | string
) {
  let opts: { adminToken?: string; userToken?: string; request?: Request; params?: Record<string, string> }
  if (typeof options === 'string') {
    opts = { adminToken: options }
  } else {
    opts = options || {}
  }
  const token = opts.adminToken || opts.userToken || ''
  const rawRequest = opts.request || new Request('http://localhost', {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  return {
    req: {
      raw: rawRequest,
      header: (name: string) => rawRequest.headers.get(name) || undefined,
      json: async <T>() => rawRequest.json() as Promise<T>,
      url: rawRequest.url,
      param: (name?: string) => (name && opts.params?.[name]) || undefined,
    },
    env: {
      DB: db,
      AUTH_TOKENS: kv,
    },
  } as unknown as import('../../server/utils/handler').AppContext
}

// ==================== 测试：requireAdmin 中间件 ====================
describe('requireAdmin 中间件', () => {
  let kv: KVNamespace

  beforeEach(() => {
    kv = new MockKV() as unknown as KVNamespace
  })

  it('有效 admin token 应通过校验', async () => {
    await saveToken(kv, 'admin-token', {
      userId: 'admin-1',
      username: 'admin',
      email: 'admin@test.com',
      role: 'admin',
      createdAt: new Date().toISOString(),
    })
    const context = createMockContext(kv, new MockD1(), 'admin-token')
    const result = await requireAdmin(context)
    expect(result).toBeNull()
  })

  it('无 token 应返回 401', async () => {
    const context = createMockContext(kv, new MockD1())
    const result = await requireAdmin(context)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(401)
  })

  it('普通用户 token 应返回 403', async () => {
    await saveToken(kv, 'user-token', {
      userId: 'user-1',
      username: 'user',
      email: 'user@test.com',
      role: 'user',
      createdAt: new Date().toISOString(),
    })
    const context = createMockContext(kv, new MockD1(), 'user-token')
    const result = await requireAdmin(context)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })

  it('无效 token 应返回 401', async () => {
    const context = createMockContext(kv, new MockD1(), 'invalid-token')
    const result = await requireAdmin(context)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(401)
  })
})

// ==================== 测试：withAdmin 包装器 ====================
describe('withAdmin 包装器', () => {
  let kv: KVNamespace

  beforeEach(() => {
    kv = new MockKV() as unknown as KVNamespace
  })

  it('admin 请求应调用 handler 并返回结果', async () => {
    await saveToken(kv, 'admin-token', {
      userId: 'admin-1',
      username: 'admin',
      email: 'admin@test.com',
      role: 'admin',
      createdAt: new Date().toISOString(),
    })

    const handler = vi.fn(async (_ctx: unknown) => {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const wrapped = withAdmin(handler as never)
    const context = createMockContext(kv, new MockD1(), 'admin-token')
    await wrapped(context)

    expect(handler).toHaveBeenCalled()
  })

  it('普通用户请求应直接返回 403，不调用 handler', async () => {
    await saveToken(kv, 'user-token', {
      userId: 'user-1',
      username: 'user',
      email: 'user@test.com',
      role: 'user',
      createdAt: new Date().toISOString(),
    })

    const handler = vi.fn(async (_ctx: unknown) => {
      return new Response(JSON.stringify({ success: true }))
    })

    const wrapped = withAdmin(handler as never)
    const context = createMockContext(kv, new MockD1(), 'user-token')
    const response = await wrapped(context)

    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
  })
})

// ==================== 测试：db 管理函数 ====================
describe('db 管理函数', () => {
  let db: MockD1

  beforeEach(() => {
    db = new MockD1()
    const usersTable = db.getTable('users')
    const ts1 = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000)
    const ts2 = Math.floor(new Date('2024-01-02T00:00:00Z').getTime() / 1000)
    usersTable.set('user-1', {
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      password_hash: 'hash1',
      avatar: null,
      role: 'user',
      created_at: ts1,
      updated_at: ts1,
    })
    usersTable.set('user-2', {
      id: 'user-2',
      username: 'bob',
      email: 'bob@example.com',
      password_hash: 'hash2',
      avatar: null,
      role: 'admin',
      created_at: ts2,
      updated_at: ts2,
    })
  })

  describe('getUserList', () => {
    it('应返回用户列表', async () => {
      const result = await getUserList(db, { limit: 20, offset: 0 })
      expect(result.total).toBeGreaterThanOrEqual(2)
      expect(result.users.length).toBeGreaterThanOrEqual(2)
    })

    it('应支持搜索过滤', async () => {
      const result = await getUserList(db, { limit: 20, offset: 0, search: 'alice' })
      expect(result.users.some((u) => u.username === 'alice')).toBe(true)
    })

    it('应支持分页', async () => {
      const result = await getUserList(db, { limit: 1, offset: 0 })
      expect(result.users.length).toBeLessThanOrEqual(1)
    })
  })

  describe('findUserByIdPublic', () => {
    it('应返回用户公开信息', async () => {
      const user = await findUserByIdPublic(db, 'user-1')
      expect(user).not.toBeNull()
      expect(user?.username).toBe('alice')
      expect(user?.email).toBe('alice@example.com')
      expect(user).toHaveProperty('role')
    })

    it('不存在的用户返回 null', async () => {
      const user = await findUserByIdPublic(db, 'nonexistent')
      expect(user).toBeNull()
    })
  })

  describe('updateUserRole', () => {
    it('应更新用户角色', async () => {
      await updateUserRole(db, 'user-1', 'admin')
      const user = await findUserByIdPublic(db, 'user-1')
      expect(user?.role).toBe('admin')
    })
  })

  describe('deleteUserById', () => {
    it('应删除用户', async () => {
      await deleteUserById(db, 'user-1')
      const user = await findUserByIdPublic(db, 'user-1')
      expect(user).toBeNull()
    })
  })

  describe('createUsageLog', () => {
    it('应创建使用日志', async () => {
      await createUsageLog(db, {
        id: 'log-1',
        user_id: 'user-1',
        action: 'chat',
        metadata: '{"msg":"hello"}',
      })
      const result = await getUsageLogs(db, { limit: 10, offset: 0 })
      expect(result.logs.length).toBeGreaterThan(0)
    })
  })

  describe('getUsageLogs', () => {
    it('应返回使用日志列表', async () => {
      const result = await getUsageLogs(db, { limit: 20, offset: 0 })
      expect(result).toHaveProperty('logs')
      expect(result).toHaveProperty('total')
    })
  })

  describe('createAuditLog', () => {
    it('应创建审计日志', async () => {
      await createAuditLog(db, {
        id: 'audit-1',
        admin_id: 'admin-1',
        action: 'UPDATE_USER_ROLE',
        target_type: 'user',
        target_id: 'user-1',
        details: '{"newRole":"admin"}',
      })
      const result = await getAuditLogs(db, { limit: 10, offset: 0 })
      expect(result.logs.length).toBeGreaterThan(0)
    })
  })

  describe('getAuditLogs', () => {
    it('应返回审计日志列表', async () => {
      const result = await getAuditLogs(db, { limit: 20, offset: 0 })
      expect(result).toHaveProperty('logs')
      expect(result).toHaveProperty('total')
    })
  })

  describe('系统配置', () => {
    it('应设置和获取配置', async () => {
      await setSystemConfig(db, 'maintenance_mode', 'false')
      const config = await getSystemConfig(db, 'maintenance_mode')
      expect(config).not.toBeNull()
      expect(config?.value).toBe('false')
    })

    it('应获取所有配置', async () => {
      await setSystemConfig(db, 'key1', 'value1')
      await setSystemConfig(db, 'key2', 'value2')
      const configs = await getAllSystemConfigs(db)
      expect(configs.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('getStats', () => {
    it('应返回统计数据', async () => {
      const stats = await getStats(db)
      expect(stats).toHaveProperty('totalUsers')
      expect(stats).toHaveProperty('todayNewUsers')
      expect(stats).toHaveProperty('totalLogs')
      expect(stats).toHaveProperty('todayLogs')
    })
  })

  describe('getDailyUserStats', () => {
    it('应返回每日用户注册统计', async () => {
      const stats = await getDailyUserStats(db, 30)
      expect(Array.isArray(stats)).toBe(true)
    })
  })

  describe('getUsageStats', () => {
    it('应返回功能使用统计', async () => {
      const stats = await getUsageStats(db)
      expect(Array.isArray(stats)).toBe(true)
    })
  })
})

// ==================== 测试：admin API handlers ====================
describe('admin API handlers', () => {
  let kv: KVNamespace
  let db: MockD1

  beforeEach(() => {
    kv = new MockKV() as unknown as KVNamespace
    db = new MockD1()
  })

  async function setupAdminToken() {
    await saveToken(kv, 'admin-token', {
      userId: 'system-admin',
      username: 'admin',
      email: 'admin@system.local',
      role: 'admin',
      createdAt: new Date().toISOString(),
    })
  }

  async function setupUserToken() {
    await saveToken(kv, 'user-token', {
      userId: 'user-1',
      username: 'user',
      email: 'user@test.com',
      role: 'user',
      createdAt: new Date().toISOString(),
    })
  }

  describe('GET /api/admin/stats', () => {
    it('admin 应能获取统计数据', async () => {
      await setupAdminToken()
      const context = createMockContext(kv, db, 'admin-token')
      const response = await statsHandler(context as never)
      expect(response.status).toBe(200)
      const body = await response.json() as { success: boolean; data: Record<string, unknown> }
      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('totalUsers')
    })

    it('普通用户应被拒绝访问', async () => {
      await setupUserToken()
      const context = createMockContext(kv, db, 'user-token')
      const response = await statsHandler(context as never)
      expect(response.status).toBe(403)
    })
  })

  describe('GET /api/admin/users', () => {
    it('admin 应能获取用户列表', async () => {
      await setupAdminToken()
      const context = createMockContext(kv, db, 'admin-token')
      const response = await apiGetUserList(context as never)
      expect(response.status).toBe(200)
      const body = await response.json() as { success: boolean; data: Record<string, unknown> }
      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('users')
      expect(body.data).toHaveProperty('total')
    })

    it('普通用户应被拒绝访问', async () => {
      await setupUserToken()
      const context = createMockContext(kv, db, 'user-token')
      const response = await apiGetUserList(context as never)
      expect(response.status).toBe(403)
    })
  })

  describe('PATCH /api/admin/users/:id', () => {
    it('admin 应能更新用户角色', async () => {
      await setupAdminToken()
      const ts = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000)
      db.getTable('users').set('user-1', {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        password_hash: 'hash1',
        avatar: null,
        accountname: null,
        role: 'user',
        data_key: null,
        created_at: ts,
        updated_at: ts,
      })

      const request = new Request('http://localhost/api/admin/users/user-1', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      })

      const context = createMockContext(kv, db, {
        adminToken: 'admin-token',
        request,
        params: { id: 'user-1' },
      })
      const response = await apiUpdateUserRole(context as never)
      expect(response.status).toBe(200)
    })

    it('缺少用户 ID 应返回 400', async () => {
      await setupAdminToken()
      const request = new Request('http://localhost/api/admin/users/', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      })
      const context = createMockContext(kv, db, {
        adminToken: 'admin-token',
        request,
        params: {},
      })
      const response = await apiUpdateUserRole(context as never)
      expect(response.status).toBe(400)
    })

    it('普通用户应被拒绝访问', async () => {
      await setupUserToken()
      const request = new Request('http://localhost/api/admin/users/user-1', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      })
      const context = createMockContext(kv, db, {
        userToken: 'user-token',
        request,
        params: { id: 'user-1' },
      })
      const response = await apiUpdateUserRole(context as never)
      expect(response.status).toBe(403)
    })
  })

  describe('DELETE /api/admin/users/:id', () => {
    it('admin 应能删除用户', async () => {
      await setupAdminToken()
      const ts = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000)
      db.getTable('users').set('user-1', {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        password_hash: 'hash1',
        avatar: null,
        accountname: null,
        role: 'user',
        data_key: null,
        created_at: ts,
        updated_at: ts,
      })

      const request = new Request('http://localhost/api/admin/users/user-1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer admin-token' },
      })
      const context = createMockContext(kv, db, {
        adminToken: 'admin-token',
        request,
        params: { id: 'user-1' },
      })
      const response = await apiDeleteUserById(context as never)
      expect(response.status).toBe(200)
    })
  })

  describe('GET /api/admin/logs', () => {
    it('admin 应能获取日志', async () => {
      await setupAdminToken()
      const context = createMockContext(kv, db, 'admin-token')
      const response = await logsHandler(context as never)
      expect(response.status).toBe(200)
      const body = await response.json() as { success: boolean }
      expect(body.success).toBe(true)
    })

    it('普通用户应被拒绝访问', async () => {
      await setupUserToken()
      const context = createMockContext(kv, db, 'user-token')
      const response = await logsHandler(context as never)
      expect(response.status).toBe(403)
    })
  })

  describe('GET /api/admin/config', () => {
    it('admin 应能获取配置', async () => {
      await setupAdminToken()
      const context = createMockContext(kv, db, 'admin-token')
      const response = await configGetHandler(context as never)
      expect(response.status).toBe(200)
      const body = await response.json() as { success: boolean }
      expect(body.success).toBe(true)
    })
  })

  describe('PUT /api/admin/config', () => {
    it('admin 应能更新配置', async () => {
      await setupAdminToken()
      const request = new Request('http://localhost/api/admin/config', {
        method: 'PUT',
        headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance_mode: 'true' }),
      })
      const context = createMockContext(kv, db, {
        adminToken: 'admin-token',
        request,
        params: {},
      })
      const response = await configPutHandler(context as never)
      expect(response.status).toBe(200)
    })
  })

  describe('权限控制 - system-admin 最高权限', () => {
    async function setupNonSystemAdminToken() {
      await saveToken(kv, 'non-sys-admin-token', {
        userId: 'admin-2',
        username: 'subadmin',
        email: 'sub@test.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
      })
    }

    async function setupSystemAdminToken() {
      await saveToken(kv, 'sys-admin-token', {
        userId: 'system-admin',
        username: 'admin',
        email: 'admin@system.local',
        role: 'admin',
        createdAt: new Date().toISOString(),
      })
    }

    it('非 system-admin 不能修改 system-admin 的权限', async () => {
      await setupNonSystemAdminToken()
      const ts = Math.floor(Date.now() / 1000)
      db.getTable('users').set('system-admin', {
        id: 'system-admin',
        username: 'admin',
        email: 'admin@system.local',
        password_hash: 'hash',
        avatar: null,
        accountname: null,
        role: 'admin',
        data_key: null,
        created_at: ts,
        updated_at: ts,
      })

      const request = new Request('http://localhost/api/admin/users/system-admin', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer non-sys-admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user' }),
      })
      const context = createMockContext(kv, db, {
        adminToken: 'non-sys-admin-token',
        request,
        params: { id: 'system-admin' },
      })
      const response = await apiUpdateUserRole(context as never)
      expect(response.status).toBe(403)
    })

    it('非 system-admin 不能授予管理员权限', async () => {
      await setupNonSystemAdminToken()
      const ts = Math.floor(Date.now() / 1000)
      db.getTable('users').set('user-x', {
        id: 'user-x',
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'hash',
        avatar: null,
        accountname: null,
        role: 'user',
        data_key: null,
        created_at: ts,
        updated_at: ts,
      })

      const request = new Request('http://localhost/api/admin/users/user-x', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer non-sys-admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      })
      const context = createMockContext(kv, db, {
        adminToken: 'non-sys-admin-token',
        request,
        params: { id: 'user-x' },
      })
      const response = await apiUpdateUserRole(context as never)
      expect(response.status).toBe(403)
    })

    it('非 system-admin 不能取消其他管理员的权限', async () => {
      await setupNonSystemAdminToken()
      const ts = Math.floor(Date.now() / 1000)
      db.getTable('users').set('admin-3', {
        id: 'admin-3',
        username: 'otheradmin',
        email: 'other@test.com',
        password_hash: 'hash',
        avatar: null,
        accountname: null,
        role: 'admin',
        data_key: null,
        created_at: ts,
        updated_at: ts,
      })

      const request = new Request('http://localhost/api/admin/users/admin-3', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer non-sys-admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user' }),
      })
      const context = createMockContext(kv, db, {
        adminToken: 'non-sys-admin-token',
        request,
        params: { id: 'admin-3' },
      })
      const response = await apiUpdateUserRole(context as never)
      expect(response.status).toBe(403)
    })

    it('system-admin 可以修改任何用户的权限', async () => {
      await setupSystemAdminToken()
      const ts = Math.floor(Date.now() / 1000)
      db.getTable('users').set('user-y', {
        id: 'user-y',
        username: 'normaluser',
        email: 'normal@test.com',
        password_hash: 'hash',
        avatar: null,
        accountname: null,
        role: 'user',
        data_key: null,
        created_at: ts,
        updated_at: ts,
      })

      const request = new Request('http://localhost/api/admin/users/user-y', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer sys-admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      })
      const context = createMockContext(kv, db, {
        adminToken: 'sys-admin-token',
        request,
        params: { id: 'user-y' },
      })
      const response = await apiUpdateUserRole(context as never)
      expect(response.status).toBe(200)
    })

    it('非 system-admin 不能删除管理员账户', async () => {
      await setupNonSystemAdminToken()
      const ts = Math.floor(Date.now() / 1000)
      db.getTable('users').set('admin-4', {
        id: 'admin-4',
        username: 'deladmin',
        email: 'del@test.com',
        password_hash: 'hash',
        avatar: null,
        accountname: null,
        role: 'admin',
        data_key: null,
        created_at: ts,
        updated_at: ts,
      })

      const request = new Request('http://localhost/api/admin/users/admin-4', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer non-sys-admin-token' },
      })
      const context = createMockContext(kv, db, {
        adminToken: 'non-sys-admin-token',
        request,
        params: { id: 'admin-4' },
      })
      const response = await apiDeleteUserById(context as never)
      expect(response.status).toBe(403)
    })
  })
})
