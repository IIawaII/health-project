const envFromWindow = (typeof window !== 'undefined' && (window as unknown as { __ENV__?: Record<string, string> }).__ENV__) || undefined

export const TURNSTILE_SITE_KEY = envFromWindow?.TURNSTILE_SITE_KEY || (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)
export const MAINTENANCE_MODE = envFromWindow?.MAINTENANCE_MODE || (import.meta.env.VITE_MAINTENANCE_MODE as string | undefined)
export const ENABLE_REGISTRATION = envFromWindow?.ENABLE_REGISTRATION || (import.meta.env.VITE_ENABLE_REGISTRATION as string | undefined)

if (!TURNSTILE_SITE_KEY && import.meta.env.DEV) {
  console.error('[config] TURNSTILE_SITE_KEY is not set, Turnstile verification will not work properly')
}
