/**
 * 带超时的 fetch 封装
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = 10000, ...rest } = init || {}

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(input, {
      ...rest,
      credentials: 'include',
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(id)
  }
}
