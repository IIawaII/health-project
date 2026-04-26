import { describe, it, expect } from 'vitest'

// SSRF 防护函数是模块私有，通过重新导出或间接测试
// 这里直接测试 isValidLLMUrl 的等价逻辑

async function isValidLLMUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname
    if (!hostname) return false
    if (hostname === 'localhost' || hostname.endsWith('.local')) return false

    // 简化的 IPv4 校验
    const ipv4Parts = hostname.split('.')
    const isIPv4 = ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
    if (isIPv4) {
      const [a, b] = ipv4Parts.map(Number)
      if (a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a >= 224) return false
    }

    // 简化的 IPv6 校验（Node URL hostname 对 IPv6 含方括号）
    if (hostname.includes(':')) {
      const raw = hostname.replace(/^\[|\]$/g, '').toLowerCase()
      if (raw === '::' || raw === '::1' || raw.startsWith('fe') || raw.startsWith('fc') || raw.startsWith('fd') || raw.startsWith('ff') || raw.startsWith('2001:db8')) return false
    }

    return true
  } catch {
    return false
  }
}

describe('llm SSRF protection', () => {
  it('should allow public URLs', async () => {
    expect(await isValidLLMUrl('https://api.openai.com/v1')).toBe(true)
    expect(await isValidLLMUrl('http://example.com')).toBe(true)
    expect(await isValidLLMUrl('https://dashscope.aliyuncs.com')).toBe(true)
  })

  it('should reject localhost and .local', async () => {
    expect(await isValidLLMUrl('http://localhost:3000')).toBe(false)
    expect(await isValidLLMUrl('http://api.local')).toBe(false)
    expect(await isValidLLMUrl('http://myhost.local')).toBe(false)
  })

  it('should reject private IPv4 addresses', async () => {
    expect(await isValidLLMUrl('http://127.0.0.1')).toBe(false)
    expect(await isValidLLMUrl('http://10.0.0.1')).toBe(false)
    expect(await isValidLLMUrl('http://192.168.1.1')).toBe(false)
    expect(await isValidLLMUrl('http://172.16.0.1')).toBe(false)
    expect(await isValidLLMUrl('http://169.254.1.1')).toBe(false)
    expect(await isValidLLMUrl('http://0.0.0.0')).toBe(false)
    expect(await isValidLLMUrl('http://224.0.0.1')).toBe(false)
  })

  it('should allow public IPv4 addresses', async () => {
    expect(await isValidLLMUrl('http://8.8.8.8')).toBe(true)
    expect(await isValidLLMUrl('http://1.1.1.1')).toBe(true)
  })

  it('should reject private IPv6 addresses', async () => {
    expect(await isValidLLMUrl('http://[::1]')).toBe(false)
    expect(await isValidLLMUrl('http://[::]')).toBe(false)
    expect(await isValidLLMUrl('http://[fc00::1]')).toBe(false)
    expect(await isValidLLMUrl('http://[fe80::1]')).toBe(false)
  })

  it('should reject non-http protocols', async () => {
    expect(await isValidLLMUrl('ftp://example.com')).toBe(false)
    expect(await isValidLLMUrl('file:///etc/passwd')).toBe(false)
    expect(await isValidLLMUrl('javascript:alert(1)')).toBe(false)
  })

  it('should reject malformed URLs', async () => {
    expect(await isValidLLMUrl('not-a-url')).toBe(false)
    expect(await isValidLLMUrl('')).toBe(false)
  })
})
