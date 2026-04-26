const envFromWindow = (typeof window !== 'undefined' && (window as unknown as { __ENV__?: Record<string, string> }).__ENV__) || undefined

export const TURNSTILE_SITE_KEY = envFromWindow?.TURNSTILE_SITE_KEY || (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)
export const SITE_NAME = envFromWindow?.SITE_NAME || (import.meta.env.VITE_SITE_NAME as string | undefined)
export const WELCOME_MESSAGE = envFromWindow?.WELCOME_MESSAGE || (import.meta.env.VITE_WELCOME_MESSAGE as string | undefined)
export const MAINTENANCE_MODE = envFromWindow?.MAINTENANCE_MODE || (import.meta.env.VITE_MAINTENANCE_MODE as string | undefined)
export const ENABLE_REGISTRATION = envFromWindow?.ENABLE_REGISTRATION || (import.meta.env.VITE_ENABLE_REGISTRATION as string | undefined)

if (!TURNSTILE_SITE_KEY && import.meta.env.DEV) {
  console.error('[config] TURNSTILE_SITE_KEY 未设置，Turnstile 验证将无法正常工作')
}
