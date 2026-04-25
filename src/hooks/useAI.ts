import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getStoredApiConfig } from '../lib/aiConfig'
import { getApiError, parseStreamChunk } from '../lib/utils'

interface UseAIOptions<T> {
  endpoint: string
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
}

interface UseAIReturn<T> {
  loading: boolean
  error: string | null
  result: T | null
  execute: (payload: Record<string, unknown>) => Promise<void>
}

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }
  const cfg = getStoredApiConfig()
  if (cfg?.baseUrl) headers['X-AI-Base-URL'] = cfg.baseUrl
  if (cfg?.apiKey) headers['X-AI-API-Key'] = cfg.apiKey
  if (cfg?.model) headers['X-AI-Model'] = cfg.model
  return headers
}

export function useAI<T = unknown>(options: UseAIOptions<T>): UseAIReturn<T> {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<T | null>(null)

  // 使用 ref 保存 options 引用，避免 options 对象变化导致 execute 频繁重建
  const optionsRef = useRef(options)
  optionsRef.current = options

  const execute = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!token) {
        setLoading(false)
        setResult(null)
        setError('请先登录')
        return
      }

      setLoading(true)
      setError(null)
      setResult(null)

      const currentOptions = optionsRef.current

      try {
        const response = await fetch(currentOptions.endpoint, {
          method: 'POST',
          headers: buildHeaders(token),
          body: JSON.stringify(payload),
        })

        // 优先尝试直接解析 JSON，避免先转 text 再 parse 的内存开销
        let data: unknown
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          data = await response.json()
        } else {
          const text = await response.text()
          try {
            data = JSON.parse(text)
          } catch {
            data = { error: text || `请求失败: ${response.status}` }
          }
        }

        if (!response.ok || getApiError(data)) {
          throw new Error(getApiError(data) || `请求失败: ${response.status}`)
        }

        const result = data as T
        setResult(result)
        currentOptions.onSuccess?.(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        currentOptions.onError?.(msg)
      } finally {
        setLoading(false)
      }
    },
    [token]
  )

  return { loading, error, result, execute }
}

export function useAIStream(options: {
  endpoint: string
  onChunk: (chunk: string) => void
  onError?: (error: string) => void
  onDone?: () => void
}) {
  const { token, refreshToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  // 使用 ref 保存 options 引用，避免 options 对象变化导致 execute 频繁重建
  const optionsRef = useRef(options)
  optionsRef.current = options

  const execute = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!token) {
        setLoading(false)
        setError('请先登录')
        return
      }

      // 取消上一个未完成的请求
      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setLoading(true)
      setError(null)

      const currentOptions = optionsRef.current

      async function doFetch(authToken: string) {
        return fetch(currentOptions.endpoint, {
          method: 'POST',
          headers: buildHeaders(authToken),
          body: JSON.stringify({ ...payload, stream: true }),
          signal: controller.signal,
        })
      }

      try {
        let response = await doFetch(token)

        // 401 时尝试自动刷新 Token 并重试一次
        if (response.status === 401) {
          const newToken = await refreshToken()
          if (newToken) {
            response = await doFetch(newToken)
          } else {
            throw new Error('登录已过期，请重新登录')
          }
        }

        if (!response.ok) {
          const text = await response.text()
          let errMsg: string
          try {
            const data = JSON.parse(text)
            errMsg = getApiError(data) || `请求失败: ${response.status}`
          } catch {
            errMsg = text || `请求失败: ${response.status}`
          }
          throw new Error(errMsg)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('无法读取响应流')
        }

        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed === 'data: [DONE]') continue
            if (trimmed.startsWith('data: ')) {
              try {
                const json: unknown = JSON.parse(trimmed.slice(6))
                const content = parseStreamChunk(json)
                if (content) {
                  currentOptions.onChunk(content)
                }
              } catch {
                // ignore malformed JSON
              }
            }
          }
        }

        currentOptions.onDone?.()
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        currentOptions.onError?.(msg)
      } finally {
        setLoading(false)
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [token, refreshToken]
  )

  return { loading, error, execute, abort }
}
