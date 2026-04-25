/**
 * SPA Fallback 与客户端配置注入
 */

import { addSecurityHeaders } from './security'
import { NO_CACHE } from './cache'
import type { Env } from '../lib/env'

function addNonceToScripts(html: string, nonce?: string): string {
  if (!nonce) return html
  return html.replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
}

export function injectClientConfig(html: string, env: Env, nonce?: string): string {
  const htmlWithNonce = addNonceToScripts(html, nonce)
  const config: Record<string, string> = {}
  if (env.TURNSTILE_SITE_KEY) {
    config.TURNSTILE_SITE_KEY = env.TURNSTILE_SITE_KEY
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
  const injected = injectClientConfig(html, env, nonce)
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', NO_CACHE)
  const res = new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
  return addSecurityHeaders(res, true, nonce)
}
