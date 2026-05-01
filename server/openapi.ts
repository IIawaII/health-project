/**
 * OpenAPI 3.0 规范定义
 * 描述所有 API 接口的请求/响应结构
 */

import { z } from 'zod'
import { extendZodWithOpenApi } from '@hono/zod-openapi'

extendZodWithOpenApi(z)

// ==================== 通用 Schema ====================
export const errorResponseSchema = z.object({
  error: z.string().openapi({ description: '错误消息', example: '请求参数错误' }),
}).openapi('ErrorResponse')

export const successResponseSchema = z.object({
  success: z.boolean().openapi({ description: '是否成功', example: true }),
  message: z.string().optional().openapi({ description: '提示消息', example: '操作成功' }),
}).openapi('SuccessResponse')

// ==================== Auth Schemas ====================
export const loginRequestSchema = z.object({
  usernameOrEmail: z.string().min(1).max(254).openapi({ description: '用户名或邮箱', example: 'admin' }),
  password: z.string().min(1).max(128).openapi({ description: '密码', example: '********' }),
  turnstileToken: z.string().min(1).openapi({ description: 'Turnstile 验证令牌' }),
}).openapi('LoginRequest')

export const loginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    avatar: z.string().nullable().optional(),
    role: z.string(),
    dataKey: z.string().optional(),
  }),
}).openapi('LoginResponse')

export const registerRequestSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,10}$/).openapi({ description: '用户名（3-10位字母数字下划线）', example: 'testuser' }),
  email: z.string().email().openapi({ description: '邮箱地址', example: 'test@example.com' }),
  password: z.string().min(8).max(128).openapi({ description: '密码（至少8位，包含字母和数字）' }),
  turnstileToken: z.string().min(1).openapi({ description: 'Turnstile 验证令牌' }),
  verificationCode: z.string().regex(/^\d{6}$/).openapi({ description: '6位数字验证码', example: '123456' }),
}).openapi('RegisterRequest')

export const sendCodeRequestSchema = z.object({
  email: z.string().email().openapi({ description: '邮箱地址' }),
  type: z.enum(['register', 'update_email']).openapi({ description: '验证码类型' }),
  turnstileToken: z.string().optional().openapi({ description: 'Turnstile 令牌（注册时需要）' }),
  currentEmail: z.string().optional().openapi({ description: '当前邮箱（修改邮箱时需要）' }),
}).openapi('SendCodeRequest')

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128).openapi({ description: '当前密码' }),
  newPassword: z.string().min(8).max(128).openapi({ description: '新密码' }),
}).openapi('ChangePasswordRequest')

export const updateProfileRequestSchema = z.object({
  username: z.string().optional().openapi({ description: '新用户名' }),
  email: z.string().email().optional().openapi({ description: '新邮箱' }),
  avatar: z.string().optional().openapi({ description: '头像 URL' }),
  accountname: z.string().max(20).optional().openapi({ description: '称呼/昵称' }),
  verificationCode: z.string().optional().openapi({ description: '修改邮箱时的验证码' }),
}).openapi('UpdateProfileRequest')

// ==================== AI Schemas ====================
export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(8000),
  })).min(1).max(50).openapi({ description: '对话消息列表' }),
  stream: z.boolean().optional().openapi({ description: '是否流式响应', example: false }),
}).openapi('ChatRequest')

export const analyzeRequestSchema = z.object({
  fileData: z.string().min(1).openapi({ description: '文件数据（base64 或纯文本）' }),
  fileType: z.enum(['image/png', 'image/jpeg', 'image/jpg', 'text/plain']).openapi({ description: '文件类型（PDF 文件会在前端提取文本后以 text/plain 发送）' }),
  fileName: z.string().min(1).max(255).openapi({ description: '文件名' }),
  stream: z.boolean().optional().openapi({ description: '是否流式响应' }),
}).openapi('AnalyzeRequest')

export const planRequestSchema = z.object({
  goal: z.string().min(1).max(2000).openapi({ description: '健康目标' }),
  preferences: z.string().optional().openapi({ description: '偏好设置' }),
  stream: z.boolean().optional(),
}).openapi('PlanRequest')

export const quizRequestSchema = z.object({
  topic: z.string().min(1).max(500).openapi({ description: '测验主题' }),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().openapi({ description: '难度' }),
  count: z.number().min(1).max(20).optional().openapi({ description: '题目数量', example: 5 }),
}).openapi('QuizRequest')

// ==================== Admin Schemas ====================
export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().openapi({ description: '页码', example: 1 }),
  pageSize: z.coerce.number().min(1).max(100).optional().openapi({ description: '每页数量', example: 20 }),
  search: z.string().optional().openapi({ description: '搜索关键词' }),
}).openapi('AdminUsersQuery')

export const adminUpdateRoleSchema = z.object({
  role: z.enum(['user', 'admin']).openapi({ description: '新角色' }),
}).openapi('AdminUpdateRole')

export const adminConfigUpdateSchema = z.record(z.string().min(1).max(500)).openapi('AdminConfigUpdate')

// ==================== OpenAPI 文档定义 ====================
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Cloud Health API',
    version: '1.0.0',
    description: 'Cloud Health 健康管理平台 API 文档',
    contact: {
      name: 'Cloud Health Team',
    },
  },
  servers: [
    { url: 'https://your-worker.workers.dev', description: '生产环境' },
    { url: 'http://localhost:8787', description: '本地开发' },
  ],
  tags: [
    { name: 'Auth', description: '认证相关接口' },
    { name: 'AI', description: 'AI 功能接口' },
    { name: 'Admin', description: '管理后台接口' },
    { name: 'System', description: '系统接口' },
  ],
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: '用户注册',
        description: '创建新用户账号',
        requestBody: { content: { 'application/json': { schema: registerRequestSchema } } },
        responses: {
          '201': { description: '注册成功' },
          '400': { description: '参数错误' },
          '409': { description: '用户名或邮箱已存在' },
          '429': { description: '请求过于频繁' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: '用户登录',
        requestBody: { content: { 'application/json': { schema: loginRequestSchema } } },
        responses: {
          '200': { description: '登录成功', content: { 'application/json': { schema: loginResponseSchema } } },
          '401': { description: '用户名或密码错误' },
          '429': { description: '登录尝试过于频繁' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: '用户登出',
        responses: { '200': { description: '登出成功' } },
      },
    },
    '/api/auth/verify': {
      get: {
        tags: ['Auth'],
        summary: '验证令牌',
        description: '验证当前用户的认证令牌是否有效',
        responses: {
          '200': { description: '令牌有效，返回用户信息' },
          '401': { description: '令牌无效或已过期' },
        },
      },
    },
    '/api/auth/change_password': {
      post: {
        tags: ['Auth'],
        summary: '修改密码',
        requestBody: { content: { 'application/json': { schema: changePasswordRequestSchema } } },
        responses: { '200': { description: '修改成功' }, '400': { description: '参数错误' } },
      },
    },
    '/api/auth/update_profile': {
      post: {
        tags: ['Auth'],
        summary: '更新个人信息',
        requestBody: { content: { 'application/json': { schema: updateProfileRequestSchema } } },
        responses: { '200': { description: '更新成功' }, '400': { description: '参数错误' } },
      },
    },
    '/api/auth/check': {
      post: {
        tags: ['Auth'],
        summary: '检查用户名/邮箱可用性',
        requestBody: {
          content: {
            'application/json': {
              schema: z.object({
                username: z.string().optional(),
                email: z.string().optional(),
              }).openapi('CheckRequest'),
            },
          },
        },
        responses: { '200': { description: '可用性检查结果' } },
      },
    },
    '/api/auth/sendVerificationCode': {
      post: {
        tags: ['Auth'],
        summary: '发送验证码',
        requestBody: { content: { 'application/json': { schema: sendCodeRequestSchema } } },
        responses: {
          '200': { description: '发送成功' },
          '400': { description: '参数错误' },
          '429': { description: '发送过于频繁' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: '刷新令牌',
        responses: { '200': { description: '刷新成功' }, '401': { description: '刷新令牌无效' } },
      },
    },
    '/api/chat': {
      post: {
        tags: ['AI'],
        summary: 'AI 对话',
        description: '与 AI 健康顾问进行对话',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: chatRequestSchema } } },
        responses: {
          '200': { description: '对话响应' },
          '401': { description: '未授权' },
          '429': { description: '请求过于频繁' },
        },
      },
    },
    '/api/analyze': {
      post: {
        tags: ['AI'],
        summary: '分析健康报告',
        description: '上传并分析健康报告（图片/PDF/文本）',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: analyzeRequestSchema } } },
        responses: {
          '200': { description: '分析结果' },
          '413': { description: '文件过大' },
          '502': { description: 'AI 服务不可用' },
        },
      },
    },
    '/api/plan': {
      post: {
        tags: ['AI'],
        summary: '生成健康计划',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: planRequestSchema } } },
        responses: { '200': { description: '健康计划' } },
      },
    },
    '/api/quiz': {
      post: {
        tags: ['AI'],
        summary: '生成健康测验',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: quizRequestSchema } } },
        responses: { '200': { description: '测验题目' } },
      },
    },
    '/api/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: '获取统计数据',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '统计数据' }, '403': { description: '无权限' } },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Admin'],
        summary: '获取用户列表',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: '用户列表' } },
      },
    },
    '/api/admin/users/{id}': {
      patch: {
        tags: ['Admin'],
        summary: '更新用户角色',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: adminUpdateRoleSchema } } },
        responses: { '200': { description: '更新成功' }, '404': { description: '用户不存在' } },
      },
      delete: {
        tags: ['Admin'],
        summary: '删除用户',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: '删除成功' } },
      },
    },
    '/api/admin/logs': {
      get: {
        tags: ['Admin'],
        summary: '获取使用日志',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: '日志列表' } },
      },
    },
    '/api/admin/audit': {
      get: {
        tags: ['Admin'],
        summary: '获取审计日志',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: '审计日志列表' } },
      },
    },
    '/api/admin/config': {
      get: {
        tags: ['Admin'],
        summary: '获取系统配置',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'key', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: '配置信息' } },
      },
      put: {
        tags: ['Admin'],
        summary: '更新系统配置',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: adminConfigUpdateSchema } } },
        responses: { '200': { description: '更新成功' } },
      },
    },
    '/api/health': {
      get: {
        tags: ['System'],
        summary: '健康检查',
        responses: { '200': { description: '服务正常' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: '使用登录接口获取的 access token',
      },
    },
  },
}
