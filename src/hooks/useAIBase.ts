import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface UseAIBaseReturn {
  loading: boolean
  error: string | null
  isMountedRef: React.MutableRefObject<boolean>
  abortControllerRef: React.MutableRefObject<AbortController | null>
  startRequest: () => AbortController | null
  finishRequest: (controller?: AbortController | null) => void
  handleError: (err: unknown, onError?: (msg: string) => void) => string | null
  setError: (value: string | null) => void
}

export function useAIBase(): UseAIBaseReturn {
  const { isAuthenticated } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  const startRequest = useCallback((): AbortController | null => {
    if (!isAuthenticated) {
      if (isMountedRef.current) {
        setLoading(false)
        setError('请先登录')
      }
      return null
    }
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    if (isMountedRef.current) {
      setLoading(true)
      setError(null)
    }
    return controller
  }, [isAuthenticated])

  const finishRequest = useCallback((controller?: AbortController | null) => {
    if (isMountedRef.current) {
      setLoading(false)
    }
    if (controller && abortControllerRef.current === controller) {
      abortControllerRef.current = null
    }
  }, [])

  const handleError = useCallback((err: unknown, onError?: (msg: string) => void): string | null => {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (isMountedRef.current) {
      setError(msg)
      onError?.(msg)
    }
    return msg
  }, [])

  return {
    loading,
    error,
    isMountedRef,
    abortControllerRef,
    startRequest,
    finishRequest,
    handleError,
    setError,
  }
}
