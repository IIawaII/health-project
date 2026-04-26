import { describe, it, expect } from 'vitest'
import { resolveErrorMessage } from '../../../src/utils'

describe('resolveErrorMessage', () => {
  it('should return 503 specific message', () => {
    expect(resolveErrorMessage(503, '{"error":"unconfigured"}')).toBe(
      'AI 服务未配置，请在设置中填写 API 信息或联系管理员'
    )
  })

  it('should return 502/504 timeout message', () => {
    expect(resolveErrorMessage(502, '{"error":"bad gateway"}')).toBe(
      '服务器处理超时，请尝试上传较小的文件或稍后重试'
    )
    expect(resolveErrorMessage(504, '{"error":"gateway timeout"}')).toBe(
      '服务器处理超时，请尝试上传较小的文件或稍后重试'
    )
  })

  it('should extract error from JSON response', () => {
    expect(resolveErrorMessage(400, '{"error":"invalid input"}')).toBe('invalid input')
  })

  it('should fallback to status text when JSON has no error', () => {
    expect(resolveErrorMessage(500, '{"message":"ok"}')).toBe('请求失败: 500')
  })

  it('should fallback to raw text when not JSON', () => {
    expect(resolveErrorMessage(500, 'Internal Server Error')).toBe('Internal Server Error')
  })

  it('should fallback to status code when text is empty', () => {
    expect(resolveErrorMessage(500, '')).toBe('请求失败: 500')
  })
})
