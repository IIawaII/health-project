import { webcrypto } from 'node:crypto'

// 为 Vitest Node 环境提供 Web Crypto API，以兼容 Cloudflare Workers 运行时中的 crypto 全局对象
if (!globalThis.crypto || !(globalThis.crypto as typeof webcrypto).getRandomValues) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  })
}
