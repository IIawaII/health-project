import { verifyToken } from '../../lib/auth';
import { jsonResponse, errorResponse } from '../../lib/response';

interface Env {
  USERS: KVNamespace;
  AUTH_TOKENS: KVNamespace;
}

export const onRequestPost = async (context: EventContext<Env, string, Record<string, unknown>>) => {
  try {
    // 验证 token（复用 lib/auth 中的逻辑）
    const tokenData = await verifyToken(context);
    if (!tokenData) {
      return errorResponse('登录已过期', 401);
    }

    const userId = tokenData.userId;

    // 尝试获取用户数据（普通用户）
    const userDataStr = await context.env.USERS.get(`user:${userId}`);

    let user: {
      id: string;
      username: string;
      email: string;
      avatar?: string;
      passwordHash?: string;
    };

    if (userDataStr) {
      user = JSON.parse(userDataStr);
    } else {
      // 本地开发模式：测试账号没有存储在 USERS 中，直接从 token 数据构建
      user = { id: userId, username: tokenData.username, email: tokenData.email };
    }

    const body = await context.request.json<{ email?: string; avatar?: string }>();

    // 更新邮箱
    if (body.email && body.email !== user.email) {
      // 检查新邮箱是否已被使用（仅对非测试账号）
      if (userDataStr) {
        const existingUser = await context.env.USERS.get(`email:${body.email}`);
        if (existingUser && existingUser !== userId) {
          return errorResponse('该邮箱已被使用', 400);
        }
        // 先写入新邮箱映射，确保新索引始终可用，再删除旧映射，避免中间状态导致数据不一致
        await context.env.USERS.put(`email:${body.email}`, userId);
        await context.env.USERS.put(`user:${userId}`, JSON.stringify({ ...user, email: body.email }));
        await context.env.USERS.delete(`email:${user.email}`);
        user.email = body.email;
      } else {
        user.email = body.email;
        await context.env.USERS.put(`user:${userId}`, JSON.stringify(user));
      }
    } else {
      // 更新头像
      if (body.avatar) {
        user.avatar = body.avatar;
      }
      // 保存更新后的用户数据（测试账号也会保存）
      await context.env.USERS.put(`user:${userId}`, JSON.stringify(user));
    }

    return jsonResponse({
      success: true,
      message: '更新成功',
      user: {
        id: userId,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      },
    }, 200);
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse('更新失败，请稍后重试', 500);
  }
};
