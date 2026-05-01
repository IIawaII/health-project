import { verifyToken } from '../utils/auth';
import { errorResponse } from '../utils/response';
import { getLogger } from '../utils/logger';
import { t } from '../../shared/i18n/server';
import type { AppContext } from '../utils/handler';
import type { TokenData } from '../utils/auth';

const logger = getLogger('Admin')

/** 扩展 Context，注入 tokenData 避免 handler 重复校验 */
export interface AdminContext extends AppContext {
  tokenData: TokenData
}

/**
 * 管理员权限校验中间件
 * 验证请求中的 Bearer Token，并检查 role === 'admin'
 * 返回 null 表示通过，返回 Response 表示拒绝
 * 通过时将 tokenData 注入 context
 */
export async function requireAdmin(
  context: AppContext
): Promise<Response | null> {
  const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
  if (!tokenData) {
    return errorResponse(t('admin.errors.unauthorized', '未授权，请先登录'), 401);
  }
  if (tokenData.role !== 'admin') {
    logger.warn('Non-admin access attempt', { userId: tokenData.userId, role: tokenData.role });
    return errorResponse(t('admin.errors.insufficientPermissions', '权限不足，需要管理员权限'), 403);
  }
  // 将 tokenData 注入 context，handler 中可直接使用
  (context as AdminContext).tokenData = tokenData;
  return null;
}

/**
 * 包装 admin API handler，自动执行权限校验并注入 tokenData
 * Handler 可通过 context.tokenData 获取已验证的令牌数据，无需重复调用 verifyToken
 */
export function withAdmin(handler: (context: AdminContext) => Promise<Response>) {
  return async (context: AppContext): Promise<Response> => {
    const denied = await requireAdmin(context);
    if (denied) return denied;
    return handler(context as AdminContext);
  };
}
