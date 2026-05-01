import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { parseStreamChunk, resolveErrorMessage } from '../utils'
import { useAIBase } from './useAIBase'
import { fetchWithTimeout } from '@/api/client'
import i18n from '@/i18n'

const STREAM_TIMEOUT_MS = 120_000

async function buildHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
  }
}

export function useAIStream(options: {
  endpoint: string
  onChunk: (chunk: string) => void
  onError?: (error: string) => void
  onDone?: () => void
}) {
  const { refreshSession } = useAuth()
  const { loading, error, isMountedRef, startRequest, finishRequest, handleError } = useAIBase()
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const optionsRef = useRef(options)
  optionsRef.current = options

  const execute = useCallback(
    async (payload: Record<string, unknown>) => {
      const controller = startRequest()
      if (!controller) return

      abortControllerRef.current = controller

      const currentOptions = optionsRef.current

      async function doFetch() {
        return fetchWithTimeout(currentOptions.endpoint, {
          method: 'POST',
          headers: await buildHeaders(),
          body: JSON.stringify({ ...payload, stream: true }),
          signal: controller!.signal,
          timeout: STREAM_TIMEOUT_MS,
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

        if (!response.ok) {
          const text = await response.text()
          throw new Error(resolveErrorMessage(response.status, text))
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error(i18n.t('ai.streamUnreadable'))
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

        if (isMountedRef.current) {
          currentOptions.onDone?.()
        }
      } catch (err) {
        handleError(err, currentOptions.onError)
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        finishRequest(controller)
      }
    },
    [startRequest, finishRequest, handleError, isMountedRef, refreshSession]
  )

  return { loading, error, execute, abort }
}
