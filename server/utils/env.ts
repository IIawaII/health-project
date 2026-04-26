/**
 * 全局 Env 类型定义
 * 供所有 API handler 复用
 */

export interface Env {
  DB: D1Database
  AUTH_TOKENS: KVNamespace
  /** 用于 IP 级别发送验证码速率限制（邮箱级别冷却已迁移到 D1） */
  VERIFICATION_CODES: KVNamespace
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY: string
  RESEND_API_KEY?: string
  /** 邮件发送域名，默认为 resend.dev */
  RESEND_DOMAIN?: string
  AI_API_KEY: string
  AI_BASE_URL: string
  AI_MODEL: string
  ALLOWED_ORIGINS?: string
  ASSETS?: Fetcher
  /** 管理员用户名（从 GitHub Actions vars 注入） */
  ADMIN_USERNAME?: string
  /** 管理员密码哈希（必须为 PBKDF2 格式：iterations:salt:hash，可用 crypto.hashPassword 生成） */
  ADMIN_PASSWORD?: string
}
