/**
 * CSRF 防护中间件
 * 对敏感操作（状态变更）强制要求 Authorization 头，
 * 拒绝仅依赖 Cookie 认证的请求，防止 CSRF 攻击
 */

import { errorResponse } from '../utils/response'
import { getLogger } from '../utils/logger'
import type { AppContext } from '../utils/handler'

const logger = getLogger('CSRF')

/** 需要 CSRF 保护的敏感操作路径前缀 */
const SENSITIVE_PATHS = [
  '/api/auth/change_password',
  '/api/auth/update_profile',
  '/api/auth/logout',
  '/api/admin/users',   // PATCH / DELETE
  '/api/admin/config',  // PUT
]

/**
 * 检查请求是否为敏感操作且缺少 Authorization 头
 * 返回 null 表示通过，返回 Response 表示拒绝
 */
export function requireCsrfProtection(context: AppContext): Response | null {
  const path = new URL(context.req.url).pathname
  const method = context.req.method

  // 只检查写操作（POST/PUT/PATCH/DELETE）
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null
  }

  // 检查是否为敏感路径
  const isSensitive = SENSITIVE_PATHS.some((prefix) => path.startsWith(prefix))
  if (!isSensitive) return null

  // 强制要求 Authorization 头
  const authHeader = context.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('CSRF protection: missing Authorization header for sensitive operation', {
      path,
      method,
    })
    return errorResponse('敏感操作需要 Authorization 头认证', 403)
  }

  return null
}
