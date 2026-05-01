import { z } from 'zod';
import { jsonResponse, errorResponse } from '../../utils/response';
import { getUserList, findUserByIdPublic, updateUserRole, deleteUserById } from '../../dao/user.dao';
import { createAuditLog } from '../../dao/audit.dao';
import { revokeAllUserTokens } from '../../utils/auth';
import { withAdmin } from '../../middleware/admin';
import { getLogger } from '../../utils/logger';
import { t } from '../../../shared/i18n/server';
import type { AdminContext } from '../../middleware/admin';

const logger = getLogger('AdminUsers')

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export const onRequestGet = withAdmin(async (context: AdminContext) => {
  try {
    const url = new URL(context.req.url);
    const parseResult = listSchema.safeParse({
      page: url.searchParams.get('page') ?? '1',
      pageSize: url.searchParams.get('pageSize') ?? '20',
      search: url.searchParams.get('search') || undefined,
    });
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400);
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
    logger.error('Failed to get user list', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('admin.errors.fetchUsersFailed', '获取用户列表失败'), 500);
  }
});

const SYSTEM_ADMIN_ID = 'system-admin'

export const onRequestPatch = withAdmin(async (context: AdminContext) => {
  try {
    const id = context.req.param('id');
    if (!id) {
      return errorResponse(t('admin.errors.missingUserId', '缺少用户ID'), 400);
    }

    const body = await context.req.json<unknown>();
    const parseResult = updateRoleSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400);
    }

    const user = await findUserByIdPublic(context.env.DB, id);
    if (!user) {
      return errorResponse(t('admin.errors.userNotFound', '用户不存在'), 404);
    }

    if (id === SYSTEM_ADMIN_ID && parseResult.data.role !== 'admin') {
      if (context.tokenData.userId === SYSTEM_ADMIN_ID) {
        return errorResponse(t('admin.errors.cannotDegradeSelf', '系统管理员不能降低自身角色，这会导致失去管理权限而无法恢复'), 403);
      }
      return errorResponse(t('admin.errors.cannotDegradeSystemAdmin', '不能降低系统管理员的角色'), 403);
    }

    const isSystemAdmin = context.tokenData.userId === SYSTEM_ADMIN_ID

    if (!isSystemAdmin && id === SYSTEM_ADMIN_ID) {
      return errorResponse(t('admin.errors.onlySystemAdminCanModify', '只有系统管理员才能修改系统管理员账户的权限'), 403);
    }

    if (!isSystemAdmin && user.role === 'admin' && parseResult.data.role !== 'admin') {
      return errorResponse(t('admin.errors.onlySystemAdminCanRevoke', '只有系统管理员才能取消其他管理员的管理员权限'), 403);
    }

    if (!isSystemAdmin && user.role !== 'admin' && parseResult.data.role === 'admin') {
      return errorResponse(t('admin.errors.onlySystemAdminCanGrant', '只有系统管理员才能授予管理员权限'), 403);
    }

    await updateUserRole(context.env.DB, id, parseResult.data.role);

    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: context.tokenData.userId,
      action: 'UPDATE_USER_ROLE',
      target_type: 'user',
      target_id: id,
      details: JSON.stringify({
        oldRole: user.role,
        newRole: parseResult.data.role,
        operator: context.tokenData.username,
      }),
    });

    return jsonResponse({ success: true, message: t('admin.messages.roleUpdated', '用户角色更新成功') }, 200);
  } catch (error) {
    logger.error('Failed to update user', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('admin.errors.updateUserFailed', '更新用户失败'), 500);
  }
});

export const onRequestDelete = withAdmin(async (context: AdminContext) => {
  try {
    const id = context.req.param('id');
    if (!id) {
      return errorResponse(t('admin.errors.missingUserId', '缺少用户ID'), 400);
    }

    const user = await findUserByIdPublic(context.env.DB, id);
    if (!user) {
      return errorResponse(t('admin.errors.userNotFound', '用户不存在'), 404);
    }

    if (id === context.tokenData.userId) {
      return errorResponse(t('admin.errors.cannotDeleteSelf', '不能删除自己的管理员账户'), 403);
    }

    if (id === SYSTEM_ADMIN_ID) {
      return errorResponse(t('admin.errors.cannotDeleteSystemAdmin', '不能删除系统管理员账户'), 403);
    }

    if (user.role === 'admin' && context.tokenData.userId !== SYSTEM_ADMIN_ID) {
      return errorResponse(t('admin.errors.onlySystemAdminCanDeleteAdmin', '只有系统管理员才能删除管理员账户'), 403);
    }

    await deleteUserById(context.env.DB, id);
    await revokeAllUserTokens(context.env.AUTH_TOKENS, id);

    await createAuditLog(context.env.DB, {
      id: crypto.randomUUID(),
      admin_id: context.tokenData.userId,
      action: 'DELETE_USER',
      target_type: 'user',
      target_id: id,
      details: JSON.stringify({ username: user.username, email: user.email }),
    });

    return jsonResponse({ success: true, message: t('admin.messages.userDeleted', '用户删除成功') }, 200);
  } catch (error) {
    logger.error('Failed to delete user', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(t('admin.errors.deleteUserFailed', '删除用户失败'), 500);
  }
});
