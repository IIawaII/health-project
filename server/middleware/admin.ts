import { verifyToken } from '../utils/auth';
import { errorResponse } from '../utils/response';
import type { AppContext } from '../utils/handler';

/**
 * 管理员权限校验中间件
 * 验证请求中的 Bearer Token，并检查 role === 'admin'
 * 返回 null 表示通过，返回 Response 表示拒绝
 */
export async function requireAdmin(
  context: AppContext
): Promise<Response | null> {
  const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
  if (!tokenData) {
    return errorResponse('未授权，请先登录', 401);
  }
  if (tokenData.role !== 'admin') {
    return errorResponse('权限不足，需要管理员权限', 403);
  }
  return null;
}

/**
 * 包装 admin API handler，自动执行权限校验
 */
export function withAdmin(handler: (context: AppContext) => Promise<Response>) {
  return async (context: AppContext): Promise<Response> => {
    const denied = await requireAdmin(context);
    if (denied) return denied;
    return handler(context);
  };
}
