export interface TokenData {
  userId: string
  username: string
  email: string
  role: 'user' | 'admin'
  dataKey?: string
  createdAt: string
}

/** Refresh Token 数据结构与 Access Token 相同 */
export type RefreshTokenData = TokenData

export const ACCESS_TOKEN_TTL = 15 * 60 // 15 分钟
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 // 30 天

/** 管理员 Access Token 有效期（1小时） */
export const ADMIN_ACCESS_TOKEN_TTL = 60 * 60
/** 管理员 Refresh Token 有效期（24小时） */
export const ADMIN_REFRESH_TOKEN_TTL = 24 * 60 * 60

function parseJsonSafely<T>(value: string | null): T | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object') return null
    return parsed as T
  } catch {
    return null
  }
}

import { getCookie } from './cookie'

/**
 * 从 Cookie 或请求头验证 Access Token
 * 优先从 httpOnly Cookie 读取，fallback 到 Authorization header（向后兼容）
 */
export async function verifyToken(context: {
  request: Request
  env: { AUTH_TOKENS: KVNamespace }
}): Promise<TokenData | null> {
  // 优先从 Cookie 读取 token
  let token = getCookie(context.request, 'auth_token')

  // Fallback 到 Authorization header
  if (!token) {
    const authHeader = context.request.headers.get('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }
  }

  if (!token) return null
  const tokenDataStr = await context.env.AUTH_TOKENS.get(`token:${token}`)
  return parseJsonSafely<TokenData>(tokenDataStr)
}

/**
 * 保存认证令牌（Access Token），同时创建 userId 索引以便批量管理
 */
export async function saveToken(
  authTokens: KVNamespace,
  token: string,
  data: TokenData,
  ttlSeconds: number = ACCESS_TOKEN_TTL
): Promise<void> {
  const tokenValue = JSON.stringify(data)
  await authTokens.put(`token:${token}`, tokenValue, {
    expirationTtl: ttlSeconds,
  })
  await authTokens.put(`user_tokens:${data.userId}:${token}`, '1', {
    expirationTtl: ttlSeconds,
  })
}

/**
 * 保存 Refresh Token
 */
export async function saveRefreshToken(
  authTokens: KVNamespace,
  refreshToken: string,
  data: RefreshTokenData,
  ttlSeconds: number = REFRESH_TOKEN_TTL
): Promise<void> {
  const tokenValue = JSON.stringify(data)
  await authTokens.put(`refresh_token:${refreshToken}`, tokenValue, {
    expirationTtl: ttlSeconds,
  })
  await authTokens.put(`user_refresh_tokens:${data.userId}:${refreshToken}`, '1', {
    expirationTtl: ttlSeconds,
  })
}

/**
 * 验证 Refresh Token
 */
export async function verifyRefreshToken(
  authTokens: KVNamespace,
  refreshToken: string
): Promise<RefreshTokenData | null> {
  const tokenDataStr = await authTokens.get(`refresh_token:${refreshToken}`)
  return parseJsonSafely<RefreshTokenData>(tokenDataStr)
}

/**
 * 删除单个 Refresh Token 及其索引
 */
export async function deleteRefreshToken(
  authTokens: KVNamespace,
  refreshToken: string,
  userId?: string
): Promise<void> {
  await authTokens.delete(`refresh_token:${refreshToken}`)
  if (userId) {
    await authTokens.delete(`user_refresh_tokens:${userId}:${refreshToken}`)
  } else {
    const tokenDataStr = await authTokens.get(`refresh_token:${refreshToken}`)
    if (tokenDataStr) {
      try {
        const tokenData = JSON.parse(tokenDataStr) as RefreshTokenData
        await authTokens.delete(`user_refresh_tokens:${tokenData.userId}:${refreshToken}`)
      } catch {
        // ignore parse error
      }
    }
  }
}

/**
 * 删除单个 Access Token 及其索引
 */
export async function deleteToken(
  authTokens: KVNamespace,
  token: string,
  userId?: string
): Promise<void> {
  await authTokens.delete(`token:${token}`)
  if (userId) {
    await authTokens.delete(`user_tokens:${userId}:${token}`)
  } else {
    // 尝试从 token 数据中反查 userId 并删除索引
    const tokenDataStr = await authTokens.get(`token:${token}`)
    if (tokenDataStr) {
      try {
        const tokenData = JSON.parse(tokenDataStr) as TokenData
        await authTokens.delete(`user_tokens:${tokenData.userId}:${token}`)
      } catch {
        // ignore parse error
      }
    }
  }
}

/**
 * 撤销指定用户的所有 Access Token 和 Refresh Token（用于修改密码后强制重新登录）
 */
export async function revokeAllUserTokens(
  authTokens: KVNamespace,
  userId: string
): Promise<void> {
  // 撤销 Access Tokens
  const accessList = await authTokens.list({ prefix: `user_tokens:${userId}:` })
  const accessDeletions: Promise<void>[] = []
  for (const key of accessList.keys) {
    const token = key.name.split(':').pop()
    if (token) {
      accessDeletions.push(authTokens.delete(`token:${token}`))
    }
    accessDeletions.push(authTokens.delete(key.name))
  }

  // 撤销 Refresh Tokens
  const refreshList = await authTokens.list({ prefix: `user_refresh_tokens:${userId}:` })
  const refreshDeletions: Promise<void>[] = []
  for (const key of refreshList.keys) {
    const token = key.name.split(':').pop()
    if (token) {
      refreshDeletions.push(authTokens.delete(`refresh_token:${token}`))
    }
    refreshDeletions.push(authTokens.delete(key.name))
  }

  await Promise.all([...accessDeletions, ...refreshDeletions])
}
