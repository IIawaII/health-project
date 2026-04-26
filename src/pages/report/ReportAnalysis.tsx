import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAIStream } from '@/hooks/useAI'
import { useResult } from '@/hooks/useResult'
import FileUploader from '@/components/common/FileUploader'
import ResultCard from '@/components/common/ResultCard'
import { FiLoader, FiAlertCircle, FiSearch } from 'react-icons/fi'

export default function ReportAnalysis() {
  const { t } = useTranslation()
  const [file, setFile] = useState<{ fileData: string; fileType: string; fileName: string } | null>(null)
  const { analysisResult, setAnalysisResult } = useResult()
  const [streamResult, setStreamResult] = useState(analysisResult)
  const [isStreaming, setIsStreaming] = useState(false)

  // 同步全局状态到本地
  useEffect(() => {
    setStreamResult(analysisResult)
  }, [analysisResult])

  const { loading, error, execute } = useAIStream({
    endpoint: '/api/analyze',
    onChunk: (chunk: string) => {
      setStreamResult((prev) => {
        const newResult = prev + chunk
        setAnalysisResult(newResult)
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

  const handleAnalyze = useCallback(() => {
    if (!file) return
    setStreamResult('')
    setAnalysisResult('')
    setIsStreaming(true)
    execute({
      fileData: file.fileData,
      fileType: file.fileType,
      fileName: file.fileName,
    })
  }, [file, execute, setAnalysisResult])

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 shadow-card transition-colors">
            <FileUploader
              onFileSelect={setFile}
              onClear={() => {
                setFile(null)
              }}
              selectedFile={file}
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className={`w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 ${
              !file || loading
                ? 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <>
                <FiLoader className="w-4 h-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <FiSearch className="w-4 h-4" />
                {t('nav.report')}
              </>
            )}
          </button>

          {error && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 text-danger text-sm">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div>
          {loading && !streamResult ? (
            <ResultCard title={t('nav.report')} content="" loading />
          ) : streamResult ? (
            <ResultCard
              title={t('nav.report')}
              content={streamResult}
              isStreaming={isStreaming}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 border-dashed p-10 text-center h-full flex flex-col items-center justify-center min-h-[400px] transition-colors">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-300 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted">
                {t('common.noData')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
