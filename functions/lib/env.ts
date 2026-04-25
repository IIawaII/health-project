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
  AI_API_KEY: string
  AI_BASE_URL: string
  AI_MODEL: string
  ALLOWED_ORIGINS?: string
  ASSETS?: Fetcher
}
