import { getLogger } from './logger'
import { isAppError, toErrorResponse } from './errors'
import { t } from '../../shared/i18n/server'

const logger = getLogger('Response')

export function jsonResponse<T>(data: T, status = 200, extraHeaders?: Record<string, string>, appendHeaders?: string[]): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value))
  }
  if (appendHeaders) {
    for (const h of appendHeaders) {
      const idx = h.indexOf(':')
      if (idx > 0) {
        headers.append(h.slice(0, idx).trim(), h.slice(idx + 1).trim())
      }
    }
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  })
}

export function errorResponse(error: string, status = 500, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

export function safeErrorResponse(err: unknown): Response {
  if (isAppError(err)) {
    return toErrorResponse(err)
  }
  const msg = err instanceof Error ? err.message : String(err)
  logger.error('Server error', { error: msg })
  return errorResponse(t('common.internalError', '服务器内部错误，请稍后重试'), 500)
}

export function parseLLMResult(data: unknown): string {
  if (typeof data !== 'object' || data === null) return ''
  const choices = (data as Record<string, unknown>).choices
  if (!Array.isArray(choices)) return ''
  const first = choices[0] as Record<string, unknown> | undefined
  if (!first) return ''
  const message = first.message as Record<string, unknown> | undefined
  if (!message) return ''
  return typeof message.content === 'string' ? message.content : ''
}
