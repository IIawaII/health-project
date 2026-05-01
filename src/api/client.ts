const CSRF_COOKIE_NAME = 'csrf-token'
const CSRF_HEADER_NAME = 'X-CSRF-Token'

function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split('=')
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return null
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = 10000, signal: externalSignal, ...rest } = init || {}

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(id)
      controller.abort()
      return Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
    }
    externalSignal.addEventListener('abort', () => { controller.abort() }, { once: true })
  }

  try {
    const headers = new Headers(rest.headers)
    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', 'XMLHttpRequest')
    }
    const csrfToken = getCsrfTokenFromCookie()
    if (csrfToken && !headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, csrfToken)
    }
    const response = await fetch(input, {
      ...rest,
      headers,
      credentials: 'include',
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(id)
  }
}
