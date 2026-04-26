/**
 * SPA Fallback 与客户端配置注入
 */

import { addSecurityHeaders } from './security'
import { NO_CACHE } from './cache'
import { getSystemConfig } from '../dao/config.dao'
import type { Env } from '../utils/env'

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function addNonceToScripts(html: string, nonce?: string): string {
  if (!nonce) return html
  // 仅给没有 nonce 且不是 JSON/LD 数据类型的 script 标签注入 nonce
  // 避免误匹配 <script type="application/json"> 等非 JS 脚本块
  return html.replace(
    /<script\b(?![^>]*\bnonce=)(?![^>]*\btype=["']application\/(json|ld\+json)["'])/g,
    `<script nonce="${nonce}"`
  )
}

export function injectClientConfig(html: string, env: Env, nonce?: string, extraConfig?: Record<string, string>): string {
  const htmlWithNonce = addNonceToScripts(html, nonce)
  const config: Record<string, string> = {}
  if (env.TURNSTILE_SITE_KEY) {
    config.TURNSTILE_SITE_KEY = env.TURNSTILE_SITE_KEY
  }
  if (extraConfig) {
    Object.assign(config, extraConfig)
  }
  if (Object.keys(config).length === 0) return htmlWithNonce

  const nonceAttr = nonce ? ` nonce="${nonce}"` : ''
  const script = `<script${nonceAttr}>window.__ENV__=${JSON.stringify(config)}</script>`

  // 如果 HTML 中已存在 window.__ENV__（构建时注入），尝试合并而不是重复插入
  const existingMatch = htmlWithNonce.match(/<script[^>]*>window\.__ENV__=(\{[^<]*\})<\/script>/)
  if (existingMatch) {
    try {
      const existing = JSON.parse(existingMatch[1]) as Record<string, string>
      const merged = { ...existing, ...config }
      return htmlWithNonce.replace(
        /<script[^>]*>window\.__ENV__=\{[^<]*\}<\/script>/,
        `<script${nonceAttr}>window.__ENV__=${JSON.stringify(merged)}</script>`
      )
    } catch {
      // 解析失败，fallback 到在 </head> 前插入新脚本
    }
  }

  return htmlWithNonce.replace('</head>', `${script}</head>`)
}

export async function renderSpaHtml(response: Response, env: Env, nonce: string): Promise<Response> {
  const html = await response.text()

  // 查询系统配置并注入到 HTML
  const extraConfig: Record<string, string> = {}
  try {
    const [siteName, welcomeMessage, maintenanceMode, enableRegistration] = await Promise.all([
      getSystemConfig(env.DB, 'site_name'),
      getSystemConfig(env.DB, 'welcome_message'),
      getSystemConfig(env.DB, 'maintenance_mode'),
      getSystemConfig(env.DB, 'enable_registration'),
    ])
    if (siteName) extraConfig.SITE_NAME = siteName.value
    if (welcomeMessage) extraConfig.WELCOME_MESSAGE = welcomeMessage.value
    if (maintenanceMode) extraConfig.MAINTENANCE_MODE = maintenanceMode.value
    if (enableRegistration) extraConfig.ENABLE_REGISTRATION = enableRegistration.value
  } catch {
    // 配置查询失败时静默降级，不影响页面渲染
  }

  let injected = injectClientConfig(html, env, nonce, extraConfig)

  // 如果有站点名称配置，替换 <title>
  if (extraConfig.SITE_NAME) {
    injected = injected.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(extraConfig.SITE_NAME)}</title>`)
  }

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', NO_CACHE)
  const res = new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
  return addSecurityHeaders(res, true, nonce)
}
