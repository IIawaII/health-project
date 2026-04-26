import { describe, it, expect } from 'vitest'
import { isIPv6Address } from '../../server/utils/llm'

describe('isIPv6Address', () => {
  it('应识别标准全写 IPv6 地址', () => {
    expect(isIPv6Address('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true)
    expect(isIPv6Address('fe80::1')).toBe(true)
  })

  it('应识别压缩形式 IPv6 地址', () => {
    expect(isIPv6Address('::1')).toBe(true)
    expect(isIPv6Address('::')).toBe(true)
    expect(isIPv6Address('2001:db8::1')).toBe(true)
    expect(isIPv6Address('::ffff:192.0.2.1')).toBe(true)
  })

  it('应拒绝 IPv4 地址', () => {
    expect(isIPv6Address('192.168.1.1')).toBe(false)
    expect(isIPv6Address('8.8.8.8')).toBe(false)
  })

  it('应拒绝包含非法字符的地址', () => {
    expect(isIPv6Address('2001:db8::gggg')).toBe(false)
    expect(isIPv6Address(':::')).toBe(false)
  })

  it('应拒绝多个 :: 的地址', () => {
    expect(isIPv6Address('2001::db8::1')).toBe(false)
  })

  it('应拒绝超过 8 组的地址', () => {
    expect(isIPv6Address('1:2:3:4:5:6:7:8:9')).toBe(false)
  })

  it('应拒绝空字符串和随机文本', () => {
    expect(isIPv6Address('')).toBe(false)
    expect(isIPv6Address('hello world')).toBe(false)
    expect(isIPv6Address('192.168.1.1:8080')).toBe(false)
  })
})
