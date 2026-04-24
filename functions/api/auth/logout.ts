import { deleteToken } from '../../lib/auth';
import { jsonResponse, errorResponse } from '../../lib/response';

export const onRequestPost = async (context: EventContext<{ AUTH_TOKENS: KVNamespace }, string, Record<string, unknown>>) => {
  try {
    // 从请求头获取令牌
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('未提供有效的认证令牌', 401);
    }

    const token = authHeader.substring(7);

    // 删除令牌及其索引
    await deleteToken(context.env.AUTH_TOKENS, token);

    return jsonResponse({
      success: true,
      message: '登出成功',
    }, 200);
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse('登出失败，请稍后重试', 500);
  }
};
