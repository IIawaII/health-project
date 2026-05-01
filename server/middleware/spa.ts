import { addSecurityHeaders, generateNonce } from './security'
import { NO_CACHE } from './cache'
import { getSystemConfig } from '../dao/config.dao'
import { getCache } from '../utils/cacheManager'
import type { Env } from '../utils/env'

const SPA_CONFIG_CACHE_TTL_MS = 60_000
const spaConfigCache = getCache<Record<string, string>>('spaConfig', { ttlMs: SPA_CONFIG_CACHE_TTL_MS, maxSize: 1 })

function getSpaConfigCache(): Record<string, string> | null {
  return spaConfigCache.get('config') ?? null
}

function setSpaConfigCache(data: Record<string, string>): void {
  spaConfigCache.set('config', data)
}

export function invalidateSpaConfigCache(): void {
  spaConfigCache.delete('config')
}

async function loadSpaConfig(db: D1Database): Promise<Record<string, string>> {
  const cached = getSpaConfigCache()
  if (cached) return cached

  const config: Record<string, string> = {}
  try {
    const [maintenanceMode, enableRegistration] = await Promise.all([
      getSystemConfig(db, 'maintenance_mode'),
      getSystemConfig(db, 'enable_registration'),
    ])
    if (maintenanceMode) config.MAINTENANCE_MODE = maintenanceMode.value
    if (enableRegistration) config.ENABLE_REGISTRATION = enableRegistration.value
  } catch (_e) { /* ignore config load errors */ }

  setSpaConfigCache(config)
  return config
}

export function injectClientConfig(html: string, env: Env, extraConfig?: Record<string, string>, nonce?: string): string {
  const config: Record<string, string> = {}
  if (env.TURNSTILE_SITE_KEY) {
    config.TURNSTILE_SITE_KEY = env.TURNSTILE_SITE_KEY
  }
  if (extraConfig) {
    Object.assign(config, extraConfig)
  }
  if (Object.keys(config).length === 0) return html

  const script = nonce
    ? `<script nonce="${nonce}">window.__ENV__=${JSON.stringify(config)}</script>`
    : `<script>window.__ENV__=${JSON.stringify(config)}</script>`

  const existingMatch = html.match(/<script[^>]*>window\.__ENV__=(\{[^<]*\})<\/script>/)
  if (existingMatch) {
    try {
      const existing = JSON.parse(existingMatch[1]) as Record<string, string>
      const merged = { ...existing, ...config }
      const mergedScript = nonce
        ? `<script nonce="${nonce}">window.__ENV__=${JSON.stringify(merged)}</script>`
        : `<script>window.__ENV__=${JSON.stringify(merged)}</script>`
      return html.replace(
        /<script[^>]*>window\.__ENV__=\{[^<]*\}<\/script>/,
        mergedScript
      )
    } catch (_e) { /* ignore parse errors */ }
  }

  return html.replace('</head>', `${script}</head>`)
}

const SPA_RENDER_CACHE_TTL_MS = 5_000
const spaRenderCache = getCache<string>('spaRender', { ttlMs: SPA_RENDER_CACHE_TTL_MS, maxSize: 1 })

export function invalidateSpaRenderCache(): void {
  spaRenderCache.delete('html')
}

export async function renderSpaHtml(response: Response, env: Env): Promise<Response> {
  const nonce = generateNonce()

  const cachedHtml = spaRenderCache.get('html')
  if (cachedHtml) {
    const rendered = cachedHtml.replace(/__NONCE__/g, nonce)
    const headers = new Headers()
    headers.set('Cache-Control', NO_CACHE)
    headers.set('Content-Type', 'text/html;charset=UTF-8')
    const res = new Response(rendered, { status: 200, headers })
    return addSecurityHeaders(res, true, nonce)
  }

  const html = await response.text()

  const extraConfig = await loadSpaConfig(env.DB)

  let injected = injectClientConfig(html, env, extraConfig, nonce)

  injected = injected.replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
  injected = injected.replace(/<style(?![^>]*\bnonce=)/g, `<style nonce="${nonce}"`)

  const templateHtml = injected.replace(new RegExp(nonce, 'g'), '__NONCE__')
  spaRenderCache.set('html', templateHtml)

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', NO_CACHE)
  const res = new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
  return addSecurityHeaders(res, true, nonce)
}
