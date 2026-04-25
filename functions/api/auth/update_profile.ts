import { verifyToken } from '../../lib/auth';
import { jsonResponse, errorResponse } from '../../lib/response';

interface Env {
  USERS: KVNamespace;
  AUTH_TOKENS: KVNamespace;
  VERIFICATION_CODES: KVNamespace;
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

    const body = await context.request.json<{ username?: string; email?: string; avatar?: string; verificationCode?: string }>();

    // 更新用户名
    if (body.username && body.username !== user.username) {
      // 验证用户名格式
      if (!/^[a-zA-Z0-9_]{3,10}$/.test(body.username)) {
        return errorResponse('用户名只能包含字母、数字和下划线，长度3-10位', 400);
      }
      // 检查新用户名是否已被使用
      if (userDataStr) {
        const existingUser = await context.env.USERS.get(`username:${body.username}`);
        if (existingUser && existingUser !== userId) {
          return errorResponse('该用户名已被使用', 400);
        }
        await context.env.USERS.put(`username:${body.username}`, userId);
        await context.env.USERS.put(`user:${userId}`, JSON.stringify({ ...user, username: body.username }));
        await context.env.USERS.delete(`username:${user.username}`);
        user.username = body.username;
      } else {
        user.username = body.username;
        await context.env.USERS.put(`user:${userId}`, JSON.stringify(user));
      }
    }

    // 更新邮箱
    if (body.email && body.email !== user.email) {
      // 验证验证码
      if (!body.verificationCode) {
        return errorResponse('请输入验证码', 400);
      }
      const codeKey = `verify_code:update_email:${body.email}`;
      const storedCodeData = await context.env.VERIFICATION_CODES.get(codeKey);
      if (!storedCodeData) {
        return errorResponse('验证码已过期，请重新获取', 400);
      }
      const storedCode = JSON.parse(storedCodeData) as { code: string };
      if (storedCode.code !== body.verificationCode) {
        return errorResponse('验证码错误', 400);
      }
      // 验证成功后删除验证码
      await context.env.VERIFICATION_CODES.delete(codeKey);

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
