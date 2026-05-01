import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// 显式指定 PostCSS 配置文件路径（因配置文件集中到 configs/ 目录）
const postcssConfigPath = path.resolve(__dirname, 'postcss.config.js')

/**
 * 构建时将 TURNSTILE_SITE_KEY 注入到 index.html 的 <head> 中
 * 优先从 .dev.vars 读取，其次从 wrangler.toml [vars] 读取，最后回退环境变量
 * 这样前端在应用启动前就能获得配置，无需依赖 Worker 运行时注入
 */
function injectTurnstileSiteKey(): Plugin {
  return {
    name: 'inject-turnstile-site-key',
    transformIndexHtml(html) {
      let siteKey = ''

      // 1. 优先从环境变量读取（CI/GitHub Actions 注入）
      siteKey = process.env.TURNSTILE_SITE_KEY || ''

      // 2. 本地开发回退到 .dev.vars
      if (!siteKey) {
        try {
          const varsPath = path.resolve(__dirname, '..', '.dev.vars')
          if (fs.existsSync(varsPath)) {
            const content = fs.readFileSync(varsPath, 'utf-8')
            const match = content.match(/^TURNSTILE_SITE_KEY=(.+)$/m)
            if (match) siteKey = match[1].trim()
          }
        } catch { /* ignore */ }
      }

      // 3. 最后回退到 wrangler.toml [vars]
      if (!siteKey) {
        try {
          const tomlPath = path.resolve(__dirname, '..', 'wrangler.toml')
          if (fs.existsSync(tomlPath)) {
            const content = fs.readFileSync(tomlPath, 'utf-8')
            const match = content.match(/^TURNSTILE_SITE_KEY\s*=\s*"([^"]+)"/m)
            if (match) siteKey = match[1].trim()
          }
        } catch { /* ignore */ }
      }

      if (siteKey) {
        const script = `<script>window.__ENV__=${JSON.stringify({ TURNSTILE_SITE_KEY: siteKey })}</script>`
        return html.replace('</head>', `${script}</head>`)
      }
      return html
    },
  }
}

export default defineConfig({
  plugins: [react(), injectTurnstileSiteKey()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  css: {
    postcss: postcssConfigPath,
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['localhost', '127.0.0.1'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react-dom'
            }
            if (id.includes('react') && !id.includes('react-router') && !id.includes('react-markdown') && !id.includes('react-i18next') && !id.includes('react-icons')) {
              return 'vendor-react'
            }
            if (id.includes('recharts')) {
              return 'vendor-recharts'
            }
            if (id.includes('react-markdown') || id.includes('rehype') || id.includes('remark') || id.includes('unified') || id.includes('micromark') || id.includes('mdast') || id.includes('remark-gfm')) {
              return 'vendor-markdown'
            }
            if (id.includes('react-router')) {
              return 'vendor-router'
            }
            if (id.includes('pdfjs-dist')) {
              return 'vendor-pdf'
            }
            if (id.includes('react-i18next') || id.includes('i18next')) {
              return 'vendor-i18n'
            }
            if (id.includes('react-icons')) {
              return 'vendor-icons'
            }
            if (id.includes('hono') || id.includes('zod') || id.includes('drizzle-orm')) {
              return 'vendor-shared'
            }
          }
        },
      },
    },
  },
})
