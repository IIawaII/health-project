import { useState } from 'react'
import { FiClipboard, FiCheck, FiClock, FiActivity } from 'react-icons/fi'
import MarkdownRenderer from '../chat/MarkdownRenderer'

interface AnalysisResultProps {
  result: string
}

export default function AnalysisResult({ result }: AnalysisResultProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 复制失败静默处理
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success" />
          <h3 className="text-sm font-semibold text-foreground">分析结果</h3>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            copied
              ? 'text-success bg-success/10'
              : 'text-foreground-muted hover:text-primary hover:bg-primary-50'
          }`}
        >
          {copied ? (
            <>
              <FiCheck className="w-3.5 h-3.5" />
              已复制
            </>
          ) : (
            <>
              <FiClipboard className="w-3.5 h-3.5" />
              复制结果
            </>
          )}
        </button>
      </div>
      <div className="p-6">
        <MarkdownRenderer content={result} />
      </div>
    </div>
  )
}

// 加载中状态组件
export function AnalysisResultSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <FiActivity className="w-4 h-4 text-primary animate-pulse" />
          <h3 className="text-sm font-semibold text-foreground">AI 分析中...</h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
          <FiClock className="w-3.5 h-3.5" />
          预计需要 10-30 秒
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">正在分析报告内容...</p>
            <p className="text-xs text-foreground-muted">AI 正在识别关键健康指标</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-5/6" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
        </div>
      </div>
    </div>
  )
}
