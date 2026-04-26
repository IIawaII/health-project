import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAIStream } from '@/hooks/useAI'
import { useResult } from '@/hooks/useResult'
import PlanForm from '@/components/features/PlanForm'
import type { PlanFormData } from '@/types'
import ResultCard from '@/components/common/ResultCard'
import { FiAlertCircle } from 'react-icons/fi'

export default function PlanGenerator() {
  const { t } = useTranslation()
  const { planResult, setPlanResult } = useResult()
  const [streamResult, setStreamResult] = useState(planResult)
  const [isStreaming, setIsStreaming] = useState(false)

  // 同步全局状态到本地
  useEffect(() => {
    setStreamResult(planResult)
  }, [planResult])

  const { loading, error, execute } = useAIStream({
    endpoint: '/api/plan',
    onChunk: (chunk: string) => {
      setStreamResult((prev) => {
        const newResult = prev + chunk
        setPlanResult(newResult)
        return newResult
      })
    },
    onError: () => {
      setIsStreaming(false)
    },
    onDone: () => {
      setIsStreaming(false)
    },
  })

  const handleSubmit = useCallback(
    (formData: PlanFormData) => {
      setStreamResult('')
      setPlanResult('')
      setIsStreaming(true)
      execute({ formData })
    },
    [execute, setPlanResult]
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <PlanForm onSubmit={handleSubmit} loading={loading} />

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 text-danger text-sm">
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !streamResult ? (
        <ResultCard
          title={t('plan.title')}
          content=""
          loading
          loadingText={t('plan.loading')}
          estimatedTime={t('plan.estimatedTime')}
        />
      ) : streamResult ? (
        <ResultCard
          title={t('plan.title')}
          content={streamResult}
          isStreaming={isStreaming}
        />
      ) : null}
    </div>
  )
}
