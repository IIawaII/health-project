import { preValidateAndCacheUrl, isUrlPreValidated, normalizeBaseUrl, isBasicUrlValid } from '../../utils/llm'
import { jsonResponse, errorResponse } from '../../utils/response'
import { getLogger } from '../../utils/logger'
import { t } from '../../../shared/i18n/server'
import type { AppContext } from '../../utils/handler'

const logger = getLogger('SSRF')

export async function onRequestPost(context: AppContext) {
  try {
    const body = await context.req.json<{ url?: string }>()
    const url = body.url

    if (!url || typeof url !== 'string') {
      return errorResponse(t('ai.errors.missingUrl', '缺少 url 参数'), 400)
    }

    const normalized = normalizeBaseUrl(url)
    if (!isBasicUrlValid(normalized)) {
      return jsonResponse({ valid: false, reason: 'URL 格式不合法或指向私有地址' }, 200)
    }

    const result = await preValidateAndCacheUrl(context.env.SSRF_CACHE, url)
    return jsonResponse(result, 200)
  } catch (err) {
    logger.error('SSRF validation failed', { error: err instanceof Error ? err.message : String(err) })
    return errorResponse(t('ai.errors.urlValidationFailed', 'URL 验证失败'), 500)
  }
}

export async function onRequestGet(context: AppContext) {
  const url = context.req.query('url')
  if (!url || typeof url !== 'string') {
    return errorResponse(t('ai.errors.missingUrl', '缺少 url 参数'), 400)
  }

  const isValid = await isUrlPreValidated(context.env.SSRF_CACHE, url)
  return jsonResponse({ valid: isValid }, 200)
}
