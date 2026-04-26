/**
 * 统一响应处理工具
 * 提供标准化的 JSON 响应和错误响应构建函数
 * CORS 头由 worker.ts 全局统一注入，handler 中无需重复设置
 */

export function jsonResponse<T>(data: T, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value))
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  })
}

export function errorResponse(error: string, status = 500, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

/**
 * 安全的错误响应：生产环境隐藏内部异常细节，仅记录服务端日志
 */
export function safeErrorResponse(err: unknown): Response {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('[Server Error]', msg)
  return errorResponse('服务器内部错误，请稍后重试', 500)
}

export function parseLLMResult(data: unknown): string {
  if (typeof data !== 'object' || data === null) return ''
  const choices = (data as Record<string, unknown>).choices
  if (!Array.isArray(choices)) return ''
  const first = choices[0] as Record<string, unknown> | undefined
  if (!first) return ''
  const message = first.message as Record<string, unknown> | undefined
  if (!message) return ''
  return typeof message.content === 'string' ? message.content : ''
}
