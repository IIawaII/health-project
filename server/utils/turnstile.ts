import type { AppContext } from './handler'
import { getCache } from './cacheManager'
import { getLogger } from './logger'

const logger = getLogger('Turnstile')

interface TurnstileResult {
  success: boolean
  error?: string
}

const cache = getCache<{ valid: boolean }>('turnstile', { ttlMs: 5 * 60 * 1000, maxSize: 50 })

export async function verifyTurnstile(
  token: string,
  secretKey: string,
  ip?: string
): Promise<TurnstileResult> {
  const cached = cache.get(token)
  if (cached) {
    return { success: cached.valid }
  }

  const formData = new URLSearchParams()
  formData.append('secret', secretKey)
  formData.append('response', token)
  if (ip) formData.append('remoteip', ip)

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    const data = await response.json<{ success?: boolean; 'error-codes'?: string[] }>()
    const success = data.success === true

    cache.set(token, { valid: success })

    return {
      success,
      error: data['error-codes']?.join(', '),
    }
  } catch (err) {
    logger.debug('Turnstile verification network error', { error: err instanceof Error ? err.message : String(err) })
    return { success: false, error: '网络错误' }
  }
}

export async function validateTurnstile(
  context: AppContext,
  token: string
): Promise<string | null> {
  const clientIP = context.req.header('CF-Connecting-IP') || undefined
  const result = await verifyTurnstile(token, context.env.TURNSTILE_SECRET_KEY, clientIP)
  if (result.success) return null
  return result.error ? `人机验证失败: ${result.error}` : '人机验证失败，请重试'
}
