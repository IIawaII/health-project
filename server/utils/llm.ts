/**
 * 统一的大语言模型调用层
 * 封装与 OpenAI 兼容 API 的通信，支持流式和非流式请求
 */

import { parseLLMResult } from './response'

import type { Env } from './env'

export interface CallLLMOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: Array<Record<string, unknown>>
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

/**
 * 从请求头和环境变量中解析 LLM 配置
 * 优先使用用户自定义配置（X-AI-* 头），否则回退到服务端环境变量
 */
export function resolveLLMConfig(
  request: Request,
  env: Env
): { baseUrl: string; apiKey: string; model: string } | null {
  const userBaseUrl = request.headers.get('X-AI-Base-URL')
  const userApiKey = request.headers.get('X-AI-API-Key')
  const userModel = request.headers.get('X-AI-Model')

  const baseUrl = userBaseUrl || env.AI_BASE_URL
  const apiKey = userApiKey || env.AI_API_KEY
  const model = userModel || env.AI_MODEL

  if (!baseUrl || !apiKey || !model) return null
  return { baseUrl, apiKey, model }
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

/**
 * 严格校验 IPv6 地址格式
 * 支持标准全写、压缩形式（::）及 IPv4 映射地址（::ffff:x.x.x.x）
 */
export function isIPv6Address(value: string): boolean {
  // IPv4 映射地址：::ffff:x.x.x.x
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(value)) return true

  // 特殊全零压缩形式
  if (value === '::') return true

  // 确保最多只有一个 :: 压缩
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
    // :: 压缩时，非空组数必须在 1~7 之间（至少压缩了一组）
    return nonEmptyParts.length > 0 && nonEmptyParts.length <= 7
  }

  // 无压缩时，必须有恰好 8 组
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

  // 检查环回地址的多种 IPv6 表示形式
  // ::1 已在上文处理，此处处理 0:0:0:0:0:0:0:1 的变体
  if (/^0{1,4}(:0{1,4}){0,6}:0{0,3}1$/.test(lower)) return true

  return false
}

/**
 * 综合校验 IPv6 地址（含 IPv4 映射/兼容地址的递归检查）
 */
function isDisallowedIPv6Comprehensive(value: string): boolean {
  if (isDisallowedIPv6(value)) return true

  const lower = value.toLowerCase()

  // 检查 IPv4 映射地址 ::ffff:x.x.x.x
  const mappedIpv4Match = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedIpv4Match) {
    return isDisallowedIPv4(mappedIpv4Match[1])
  }

  // 检查 IPv4 兼容地址 ::x.x.x.x（已废弃但仍可能被滥用）
  const compatIpv4Match = lower.match(/::(\d+\.\d+\.\d+\.\d+)$/)
  if (compatIpv4Match && !lower.includes('::ffff:')) {
    return isDisallowedIPv4(compatIpv4Match[1])
  }

  return false
}

async function queryDnsRecords(hostname: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const dohResponse = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
    {
      headers: { Accept: 'application/dns-json' },
    }
  )

  if (!dohResponse.ok) {
    throw new Error(`DNS 查询失败: ${type}`)
  }

  const dohData = (await dohResponse.json()) as { Answer?: Array<{ data: string }> }
  const answers = dohData.Answer ?? []

  return answers
    .map((answer) => answer.data)
    .filter((value) => (type === 'A' ? isIPv4Address(value) : isIPv6Address(value)))
}

/**
 * 校验 AI Base URL 是否合法，防止 SSRF
 * - 仅允许 http/https 协议
 * - 禁止 localhost、回环地址、私有 IP 段
 * - 通过 Cloudflare DoH 解析域名并验证解析结果
 */
async function validateLLMUrl(url: string): Promise<boolean> {
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

    const [aRecords, aaaaRecords] = await Promise.all([
      queryDnsRecords(hostname, 'A'),
      queryDnsRecords(hostname, 'AAAA'),
    ])

    const resolvedIps = [...aRecords, ...aaaaRecords]
    if (resolvedIps.length === 0) {
      return false
    }

    for (const ip of resolvedIps) {
      if (isIPv4Address(ip)) {
        if (isDisallowedIPv4(ip)) return false
        continue
      }

      if (ip.includes(':')) {
        if (isDisallowedIPv6Comprehensive(ip)) return false
        continue
      }

      return false
    }

    return true
  } catch {
    return false
  }
}

/**
 * URL 验证结果缓存。
 * 注意：在 Cloudflare Workers 中，模块级变量在 isolate 复用期间跨请求共享。
 * 该缓存设置了 TTL 和最大条目数限制，既利用了复用性能，又避免了内存无限增长。
 */
const urlValidationCache = new Map<string, { valid: boolean; expiry: number }>()
const URL_VALIDATION_CACHE_TTL = 60 * 1000 // 1 分钟：缩短 TTL 以降低 DNS 重绑定攻击的理论窗口
const URL_VALIDATION_CACHE_MAX_SIZE = 100 // 最大缓存条目数，防止恶意构造大量 URL 撑爆内存

function setUrlValidationCache(url: string, valid: boolean): void {
  // 如果超过上限，先清理已过期条目；若仍超限，淘汰最早的条目
  if (urlValidationCache.size >= URL_VALIDATION_CACHE_MAX_SIZE) {
    const now = Date.now()
    for (const [key, val] of urlValidationCache) {
      if (val.expiry <= now) {
        urlValidationCache.delete(key)
      }
    }
    if (urlValidationCache.size >= URL_VALIDATION_CACHE_MAX_SIZE) {
      const firstKey = urlValidationCache.keys().next().value
      if (firstKey !== undefined) {
        urlValidationCache.delete(firstKey)
      }
    }
  }
  urlValidationCache.set(url, { valid, expiry: Date.now() + URL_VALIDATION_CACHE_TTL })
}

async function isValidLLMUrl(url: string): Promise<boolean> {
  const cached = urlValidationCache.get(url)
  if (cached && cached.expiry > Date.now()) {
    return cached.valid
  }

  const result = await validateLLMUrl(url)
  setUrlValidationCache(url, result)
  return result
}

/**
 * 带 SSRF 防护的 fetch：禁止自动重定向，手动校验重定向目标
 */
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

/**
 * 统一调用 AI API，返回原始 Response（支持流式）
 */
export async function callLLM(options: CallLLMOptions): Promise<Response> {
  const { baseUrl, apiKey, model, messages, stream = false, temperature = 0.7, max_tokens = 3000 } = options

  if (!(await isValidLLMUrl(baseUrl))) {
    return new Response(JSON.stringify({ error: '非法的 AI API 地址' }), { status: 400 })
  }

  return await fetchWithSSRFProtection(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream,
    }),
  })
}

/**
 * 非流式调用，返回解析后的文本内容
 * 失败时抛出异常
 */
export async function callLLMText(options: CallLLMOptions): Promise<string> {
  const response = await callLLM({ ...options, stream: false })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`模型请求失败: ${err}`)
  }

  const data = await response.json()
  return parseLLMResult(data)
}

/**
 * 构建流式 SSE Response
 */
export function createStreamResponse(response: Response): Response {
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
