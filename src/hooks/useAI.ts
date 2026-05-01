import { useState, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getApiError } from '../utils'
import { useAIBase } from './useAIBase'
import { fetchWithTimeout } from '@/api/client'
import i18n from '@/i18n'

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

async function buildHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
  }
}

export function useAI<T = unknown>(options: UseAIOptions<T>): UseAIReturn<T> {
  const { refreshSession } = useAuth()
  const { loading, error, isMountedRef, startRequest, finishRequest, handleError } = useAIBase()
  const [result, setResult] = useState<T | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options

  const execute = useCallback(
    async (payload: Record<string, unknown>) => {
      const controller = startRequest()
      if (!controller) return

      if (isMountedRef.current) {
        setResult(null)
      }

      const currentOptions = optionsRef.current

      async function doFetch() {
        return fetchWithTimeout(currentOptions.endpoint, {
          method: 'POST',
          headers: await buildHeaders(),
          body: JSON.stringify(payload),
          signal: controller!.signal,
          timeout: 60000,
        })
      }

      try {
        let response = await doFetch()

        if (response.status === 401) {
          const refreshed = await refreshSession()
          if (refreshed) {
            response = await doFetch()
          } else {
            throw new Error(i18n.t('ai.sessionExpired'))
          }
        }

        let data: unknown
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          data = await response.json()
        } else {
          const text = await response.text()
          try {
            data = JSON.parse(text)
          } catch {
            data = { error: text || i18n.t('ai.requestFailed', { status: response.status }) }
          }
        }

        if (!response.ok || getApiError(data)) {
          const errMsg = getApiError(data) || i18n.t('ai.requestFailed', { status: response.status })
          if (response.status === 502 || response.status === 504) {
            throw new Error(i18n.t('ai.serverTimeout'))
          }
          throw new Error(errMsg)
        }

        const result = data as T
        if (isMountedRef.current) {
          setResult(result)
          currentOptions.onSuccess?.(result)
        }
      } catch (err) {
        handleError(err, currentOptions.onError)
      } finally {
        finishRequest(controller)
      }
    },
    [startRequest, finishRequest, handleError, isMountedRef, refreshSession]
  )

  return { loading, error, result, execute }
}
