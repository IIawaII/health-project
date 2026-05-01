/**
 * 全局 Env 类型定义
 * 供所有 API handler 复用
 */

export interface Env {
  DB: D1Database
  AUTH_TOKENS: KVNamespace
  /** 用于 IP 级别发送验证码速率限制（邮箱级别冷却已迁移到 D1） */
  VERIFICATION_CODES: KVNamespace
  /** SSRF URL 验证结果缓存（TTL 1 小时） */
  SSRF_CACHE: KVNamespace
  /** Cloudflare Queue for async email sending (production only) */
  EMAIL_QUEUE?: Queue
  /** Upstash Redis REST API URL（用于分布式速率限制，必填） */
  UPSTASH_REST_URL: string
  /** Upstash Redis REST API Token（用于分布式速率限制，必填） */
  UPSTASH_REST_TOKEN: string

  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  /** 服务端默认 AI 配置（可选，仅作为兜底，用户自有 API Key 优先） */
  AI_API_KEY?: string
  AI_BASE_URL?: string
  AI_MODEL?: string
  ALLOWED_ORIGINS?: string
  ASSETS?: Fetcher
  ENVIRONMENT?: string
  /** 管理员用户名（从 GitHub Actions vars 注入） */
  ADMIN_USERNAME?: string
  /** 管理员密码哈希（必须为 PBKDF2 格式：iterations:salt:hash，可用 crypto.hashPassword 生成） */
  ADMIN_PASSWORD?: string
  /** SMTP 超时时间（毫秒），默认 15000 */
  SMTP_TIMEOUT_MS?: string
}
