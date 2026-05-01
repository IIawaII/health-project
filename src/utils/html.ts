import i18n from '@/i18n'
import { isApiError } from './api'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resolveErrorMessage(status: number, serverText: string): string {
  if (status === 503) {
    return i18n.t('ai.aiNotConfigured')
  }
  if (status === 502 || status === 504) {
    return i18n.t('ai.serverTimeout')
  }
  try {
    const data = JSON.parse(serverText)
    if (isApiError(data)) {
      return escapeHtml(data.error)
    }
    return i18n.t('ai.requestFailed', { status })
  } catch {
    return serverText ? escapeHtml(serverText) : i18n.t('ai.requestFailed', { status })
  }
}
