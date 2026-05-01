import { parseLLMResult } from './response'
import { getLogger } from './logger'
import { getCache } from './cacheManager'
import { getAiConfig } from '../dao/ai-config.dao'

import type { Env } from './env'
import type { TokenData } from './auth'

const logger = getLogger('LLM')

export interface CallLLMOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: Array<Record<string, unknown>>
  stream?: boolean
  temperature?: number
  max_tokens?: number
  ssrfCache?: KVNamespace
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g)
  if (!pairs) throw new Error('Invalid hex string')
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)))
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function decryptAiConfig(encryptedBase64: string, dataKeyHex: string): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  try {
    const keyData = hexToBytes(dataKeyHex)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const combined = base64ToBytes(encryptedBase64)
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    )

    const decoder = new TextDecoder()
    const json = JSON.parse(decoder.decode(plaintext)) as { baseUrl?: string; apiKey?: string; model?: string }
    if (!json.baseUrl || !json.apiKey || !json.model) return null
    return { baseUrl: json.baseUrl, apiKey: json.apiKey, model: json.model }
  } catch (err) {
    logger.warn('Failed to decrypt AI config', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

const aiConfigCache = getCache<{ baseUrl: string; apiKey: string; model: string }>('aiConfig', { ttlMs: 60_000, maxSize: 200 })

export async function resolveLLMConfig(
  _request: Request,
  env: Env,
  tokenData: TokenData
): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  if (!tokenData.dataKey) {
    logger.warn('User has no dataKey, cannot resolve AI config', { userId: tokenData.userId })
    return null
  }

  const cacheKey = `${tokenData.userId}`
  const cached = aiConfigCache.get(cacheKey)
  if (cached) return cached

  const config = await getAiConfig(env.DB, tokenData.userId)
  if (!config) return null

  const decrypted = await decryptAiConfig(config.encrypted_config, tokenData.dataKey)
  if (!decrypted) return null

  aiConfigCache.set(cacheKey, decrypted)
  return decrypted
}

export function invalidateAiConfigCache(userId?: string): void {
  if (userId) {
    aiConfigCache.delete(userId)
  } else {
    aiConfigCache.clear()
  }
}

function isIPv4Address(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every(
      (part) => /^\d+$/.test(part) && !/^0\d/.test(part) && Number(part) >= 0 && Number(part) <= 255
    )
  )
}

export function isIPv6Address(value: string): boolean {
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(value)) return true
  if (value === '::') return true

  const segments = value.split('::')
  if (segments.length > 2) return false

  const hasDoubleColon = segments.length === 2

  const allParts = value.split(':')
  const nonEmptyParts: string[] = []

  for (const part of allParts) {
    if (part !== '') {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return false
      nonEmptyParts.push(part)
    }
  }

  if (hasDoubleColon) {
    return nonEmptyParts.length > 0 && nonEmptyParts.length <= 7
  }

  return nonEmptyParts.length === 8
}

function isDisallowedIPv4(value: string): boolean {
  if (!isIPv4Address(value)) return true

  const [a, b, c] = value.split('.').map((part) => Number(part))

  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true

  return false
}

function isDisallowedIPv6(value: string): boolean {
  const lower = value.toLowerCase()

  if (lower === '::' || lower === '::1') return true
  if (lower === '0:0:0:0:0:0:0:0' || lower === '0:0:0:0:0:0:0:1') return true
  if (/^fe[89ab]/.test(lower)) return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('ff')) return true
  if (lower.startsWith('2001:db8')) return true

  if (/^0{1,4}(:0{1,4}){0,6}:0{0,3}1$/.test(lower)) return true

  return false
}

function isDisallowedIPv6Comprehensive(value: string): boolean {
  if (isDisallowedIPv6(value)) return true

  const lower = value.toLowerCase()

  const mappedIpv4Match = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedIpv4Match) {
    return isDisallowedIPv4(mappedIpv4Match[1])
  }

  const compatIpv4Match = lower.match(/::(\d+\.\d+\.\d+\.\d+)$/)
  if (compatIpv4Match && !lower.includes('::ffff:')) {
    return isDisallowedIPv4(compatIpv4Match[1])
  }

  return false
}

const DNS_QUERY_TIMEOUT_MS = 5000

const DOH_PROVIDERS = [
  {
    name: 'cloudflare',
    buildUrl: (hostname: string, type: string) =>
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
  },
  {
    name: 'google',
    buildUrl: (hostname: string, type: string) =>
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`,
  },
]

async function queryDnsRecords(hostname: string, type: 'A' | 'AAAA'): Promise<string[]> {
  for (const provider of DOH_PROVIDERS) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), DNS_QUERY_TIMEOUT_MS)

      let dohResponse: Response
      try {
        dohResponse = await fetch(provider.buildUrl(hostname, type), {
          headers: { Accept: 'application/dns-json' },
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!dohResponse.ok) {
        logger.debug('DNS query failed with provider, trying next', { provider: provider.name, type, status: dohResponse.status })
        continue
      }

      const dohData = (await dohResponse.json()) as { Answer?: Array<{ data: string }> }
      const answers = dohData.Answer ?? []
      const records = answers
        .map((answer) => answer.data)
        .filter((value) => (type === 'A' ? isIPv4Address(value) : isIPv6Address(value)))

      if (records.length > 0) {
        return records
      }
    } catch (err) {
      logger.debug('DNS provider error, trying next', { provider: provider.name, type, error: err instanceof Error ? err.message : String(err) })
      continue
    }
  }

  return []
}

function isBasicUrlValid(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

    const hostname = parsed.hostname
    if (!hostname) return false
    if (hostname === 'localhost' || hostname.endsWith('.local')) return false

    if (isIPv4Address(hostname)) {
      return !isDisallowedIPv4(hostname)
    }

    if (hostname.includes(':')) {
      return !isDisallowedIPv6Comprehensive(hostname)
    }

    return true
  } catch {
    return false
  }
}

async function validateLLMUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      logger.warn('SSRF: invalid protocol', { url, protocol: parsed.protocol })
      return false
    }

    const hostname = parsed.hostname
    if (!hostname) {
      logger.warn('SSRF: empty hostname', { url })
      return false
    }
    if (hostname === 'localhost' || hostname.endsWith('.local')) {
      logger.warn('SSRF: localhost/local hostname', { url, hostname })
      return false
    }

    if (isIPv4Address(hostname)) {
      const disallowed = isDisallowedIPv4(hostname)
      if (disallowed) logger.warn('SSRF: disallowed IPv4', { url, hostname })
      return !disallowed
    }

    if (hostname.includes(':')) {
      const disallowed = isDisallowedIPv6Comprehensive(hostname)
      if (disallowed) logger.warn('SSRF: disallowed IPv6', { url, hostname })
      return !disallowed
    }

    let aRecords: string[] = []
    let aaaaRecords: string[] = []
    try {
      [aRecords, aaaaRecords] = await Promise.all([
        queryDnsRecords(hostname, 'A'),
        queryDnsRecords(hostname, 'AAAA'),
      ])
    } catch (dnsError) {
      logger.warn('SSRF: DNS resolution failed, falling back to basic URL validation', { url, hostname, error: dnsError instanceof Error ? dnsError.message : String(dnsError) })
      return isBasicUrlValid(url)
    }

    const resolvedIps = [...aRecords, ...aaaaRecords]
    if (resolvedIps.length === 0) {
      logger.info('SSRF: no DNS records resolved, falling back to basic URL validation', { url, hostname })
      return isBasicUrlValid(url)
    }

    logger.debug('SSRF: DNS resolved', { hostname, ips: resolvedIps })

    for (const ip of resolvedIps) {
      if (isIPv4Address(ip)) {
        if (isDisallowedIPv4(ip)) {
          logger.warn('SSRF: resolved to disallowed IPv4', { url, hostname, ip })
          return false
        }
        continue
      }

      if (ip.includes(':')) {
        if (isDisallowedIPv6Comprehensive(ip)) {
          logger.warn('SSRF: resolved to disallowed IPv6', { url, hostname, ip })
          return false
        }
        continue
      }

      logger.warn('SSRF: unrecognizable resolved IP', { url, hostname, ip })
      return false
    }

    return true
  } catch (parseError) {
    logger.warn('SSRF: URL parse error', { url, error: parseError instanceof Error ? parseError.message : String(parseError) })
    return false
  }
}

const urlValidationCache = getCache<boolean>('ssrfUrl', { ttlMs: 60 * 1000, maxSize: 100 })

async function isValidLLMUrl(url: string): Promise<boolean> {
  const cached = urlValidationCache.get(url)
  if (cached !== undefined) {
    return cached
  }

  const result = await validateLLMUrl(url)
  urlValidationCache.set(url, result)
  return result
}

async function fetchWithSSRFProtection(
  url: string,
  init: RequestInit,
  maxRedirects = 3
): Promise<Response> {
  let currentUrl = url
  let redirects = 0

  while (redirects <= maxRedirects) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location')
      if (!location) {
        return new Response(JSON.stringify({ error: '重定向响应缺少 Location 头' }), { status: 502 })
      }

      const newUrl = new URL(location, currentUrl).href
      if (!(await isValidLLMUrl(newUrl))) {
        return new Response(JSON.stringify({ error: '重定向目标地址不合法' }), { status: 400 })
      }

      currentUrl = newUrl
      redirects++
      continue
    }

    return response
  }

  return new Response(JSON.stringify({ error: '重定向次数过多' }), { status: 502 })
}

function normalizeBaseUrl(url: string): string {
  let normalized = url.trim()

  if (normalized.endsWith('/chat/completions')) {
    normalized = normalized.slice(0, -'/chat/completions'.length)
  }

  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

const LLM_REQUEST_TIMEOUT_MS = 60_000
const LLM_RETRY_COUNT = 2
const LLM_RETRY_DELAY_MS = 1000

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

export async function callLLM(options: CallLLMOptions): Promise<Response> {
  const { baseUrl: rawBaseUrl, apiKey, model, messages, stream = false, temperature = 0.7, max_tokens = 3000, ssrfCache } = options

  const baseUrl = normalizeBaseUrl(rawBaseUrl)

  if (ssrfCache) {
    const preValidated = await isUrlPreValidated(ssrfCache, baseUrl)
    if (!preValidated && !(await isValidLLMUrl(baseUrl))) {
      logger.warn('AI API URL rejected by SSRF validation', { baseUrl })
      return new Response(JSON.stringify({ error: 'AI API 地址不合法，请检查配置的 API 地址是否为公网可访问的 HTTPS 地址' }), { status: 400 })
    }
  } else {
    if (!(await isValidLLMUrl(baseUrl))) {
      logger.warn('AI API URL rejected by SSRF validation', { baseUrl })
      return new Response(JSON.stringify({ error: 'AI API 地址不合法，请检查配置的 API 地址是否为公网可访问的 HTTPS 地址' }), { status: 400 })
    }
  }

  const endpoint = `${baseUrl}/chat/completions`
  logger.info('Calling LLM', { endpoint, model, stream })

  const requestBody = JSON.stringify({
    model,
    messages,
    temperature,
    max_tokens,
    stream,
  })

  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= LLM_RETRY_COUNT; attempt++) {
    if (attempt > 0) {
      logger.info('Retrying LLM request', { endpoint, model, attempt })
      await new Promise((resolve) => setTimeout(resolve, LLM_RETRY_DELAY_MS * attempt))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS)

    try {
      lastResponse = await fetchWithSSRFProtection(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
        signal: controller.signal,
      })
    } catch (fetchErr) {
      logger.warn('LLM fetch error', { endpoint, attempt, error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) })
      if (attempt < LLM_RETRY_COUNT) continue
      return new Response(JSON.stringify({ error: 'AI 服务连接失败，请检查网络或 API 地址是否正确' }), { status: 502 })
    } finally {
      clearTimeout(timer)
    }

    if (!lastResponse.ok && isRetryableStatus(lastResponse.status) && attempt < LLM_RETRY_COUNT) {
      const retryAfter = lastResponse.headers.get('Retry-After')
      if (retryAfter) {
        const delay = Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
      logger.info('LLM returned retryable status, will retry', { endpoint, status: lastResponse.status, attempt })
      continue
    }

    break
  }

  return lastResponse!
}

export async function callLLMText(options: CallLLMOptions): Promise<string> {
  const response = await callLLM({ ...options, stream: false })

  if (!response.ok) {
    let errDetail = ''
    try {
      errDetail = await response.text()
    } catch { logger.debug('Failed to read error response body from LLM') }
    const statusText = response.status === 401 ? 'API Key 无效或未授权'
      : response.status === 403 ? 'API 访问被拒绝'
      : response.status === 404 ? 'API 端点不存在，请检查 Base URL 配置'
      : response.status === 429 ? 'API 请求频率超限，请稍后重试'
      : response.status >= 500 ? 'AI 服务端错误，请稍后重试'
      : `请求失败 (HTTP ${response.status})`
    throw new Error(`${statusText}${errDetail ? `: ${errDetail.slice(0, 200)}` : ''}`)
  }

  const data = await response.json()
  return parseLLMResult(data)
}

export function createStreamResponse(response: Response): Response {
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

const SSRF_KV_PREFIX = 'ssrf_validated:'
const SSRF_KV_TTL = 600

export async function preValidateAndCacheUrl(
  kv: KVNamespace,
  url: string
): Promise<{ valid: boolean; reason?: string }> {
  const normalized = normalizeBaseUrl(url)

  if (!isBasicUrlValid(normalized)) {
    return { valid: false, reason: 'URL 格式不合法或指向私有地址' }
  }

  const isValid = await validateLLMUrl(normalized)

  if (isValid) {
    try {
      await kv.put(`${SSRF_KV_PREFIX}${normalized}`, JSON.stringify({ valid: true, validatedAt: Date.now() }), {
        expirationTtl: SSRF_KV_TTL,
      })
    } catch (err) {
      logger.warn('Failed to cache SSRF validation result in KV', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { valid: isValid, reason: isValid ? undefined : 'URL 解析到私有 IP 地址或域名无法解析' }
}

export async function isUrlPreValidated(
  kv: KVNamespace,
  url: string
): Promise<boolean> {
  const normalized = normalizeBaseUrl(url)
  try {
    const cached = await kv.get(`${SSRF_KV_PREFIX}${normalized}`)
    if (cached) {
      const data = JSON.parse(cached) as { valid: boolean; validatedAt: number }
      if (data.valid && Date.now() - data.validatedAt < SSRF_KV_TTL * 1000) {
        return true
      }
    }
  } catch (_e) { /* ignore DNS resolution errors */ }

  return false
}

export { validateLLMUrl, isBasicUrlValid, normalizeBaseUrl }
