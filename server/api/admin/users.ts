import { z } from 'zod';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getUserList, findUserByIdPublic, updateUserRole, deleteUserById } from '../../dao/user.dao';
import { createAuditLog } from '../../dao/audit.dao';
import { revokeAllUserTokens } from '../../utils/auth';
import { withAdmin } from '../../middleware/admin';
import { verifyToken } from '../../utils/auth';
import type { AppContext } from '../../utils/handler';

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export const onRequestGet = withAdmin(async (context: AppContext) => {
  try {
    const url = new URL(context.req.url);
    const parseResult = listSchema.safeParse({
      page: url.searchParams.get('page') ?? '1',
      pageSize: url.searchParams.get('pageSize') ?? '20',
      search: url.searchParams.get('search') || undefined,
    });
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || '参数错误', 400);
    }

    const { page, pageSize, search } = parseResult.data;
    const offset = (page - 1) * pageSize;

    const result = await getUserList(context.env.DB, {
      limit: pageSize,
      offset,
      search,
    });

    return jsonResponse({
      success: true,
      data: {
        users: result.users,
        total: result.total,
        page,
        pageSize,
      },
    }, 200);
  } catch (error) {
    console.error('Admin users list error:', error);
    return errorResponse('获取用户列表失败', 500);
  }
});

export const onRequestPatch = withAdmin(async (context: AppContext) => {
  try {
    const id = context.req.param('id');
    if (!id) {
      return errorResponse('缺少用户ID', 400);
    }

    const body = await context.req.json<unknown>();
    const parseResult = updateRoleSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || '参数错误', 400);
    }

    const user = await findUserByIdPublic(context.env.DB, id);
    if (!user) {
      return errorResponse('用户不存在', 404);
    }

    await updateUserRole(context.env.DB, id, parseResult.data.role);

    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: tokenData?.userId ?? 'unknown',
      action: 'UPDATE_USER_ROLE',
      target_type: 'user',
      target_id: id,
      details: JSON.stringify({ oldRole: user.role, newRole: parseResult.data.role }),
    });

    return jsonResponse({ success: true, message: '用户角色更新成功' }, 200);
  } catch (error) {
    console.error('Admin update user error:', error);
    return errorResponse('更新用户失败', 500);
  }
});

export const onRequestDelete = withAdmin(async (context: AppContext) => {
  try {
    const id = context.req.param('id');
    if (!id) {
      return errorResponse('缺少用户ID', 400);
    }

    const user = await findUserByIdPublic(context.env.DB, id);
    if (!user) {
      return errorResponse('用户不存在', 404);
    }

    await deleteUserById(context.env.DB, id);
    await revokeAllUserTokens(context.env.AUTH_TOKENS, id);

    const tokenData = await verifyToken({ request: context.req.raw, env: context.env });
    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: tokenData?.userId ?? 'unknown',
      action: 'DELETE_USER',
      target_type: 'user',
      target_id: id,
      details: JSON.stringify({ username: user.username, email: user.email }),
    });

    return jsonResponse({ success: true, message: '用户删除成功' }, 200);
  } catch (error) {
    console.error('Admin delete user error:', error);
    return errorResponse('删除用户失败', 500);
  }
});
