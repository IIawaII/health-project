import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getStoredApiConfig, saveApiConfig, clearApiConfig } from '@/config/ai'
import { FiX, FiGlobe, FiKey, FiCpu, FiCheck, FiAlertCircle, FiTrash2, FiShield } from 'react-icons/fi'

interface ApiSettingsProps {
  isOpen: boolean
  onClose: () => void
  onConfigChange?: () => void
}

export default function ApiSettings({ isOpen, onClose, onConfigChange }: ApiSettingsProps) {
  const { t } = useTranslation()
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      getStoredApiConfig().then((cfg) => {
        if (cfg) {
          setBaseUrl(cfg.baseUrl)
          setApiKey(cfg.apiKey)
          setModel(cfg.model)
        }
      }).catch(() => {
        // 忽略读取错误
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSave = async () => {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      showMessage('error', t('apiConfig.errors.incomplete'))
      return
    }
    try {
      await saveApiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() })
      showMessage('success', t('apiConfig.messages.saved'))
      onConfigChange?.()
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : t('apiConfig.errors.saveFailed'))
    }
  }

  const handleClear = () => {
    clearApiConfig()
    setBaseUrl('')
    setApiKey('')
    setModel('')
    showMessage('success', t('apiConfig.messages.cleared'))
    onConfigChange?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-modal-pop border border-gray-100 dark:border-slate-700 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-primary-50 to-white dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm">
              <FiCpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground dark:text-foreground-dark leading-tight">{t('apiConfig.title')}</h2>
              <p className="text-xs text-foreground-subtle dark:text-foreground-dark-subtle mt-0.5">{t('apiConfig.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-foreground-dark transition-all"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-6 mt-5 flex items-center gap-2.5 p-3.5 rounded-xl text-sm border ${
            message.type === 'success'
              ? 'bg-success/5 text-success border-success/20'
              : 'bg-danger/5 text-danger border-danger/20'
          }`}>
            {message.type === 'success' ? <FiCheck className="w-4 h-4 flex-shrink-0" /> : <FiAlertCircle className="w-4 h-4 flex-shrink-0" />}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="text-xs text-foreground-muted dark:text-foreground-dark-muted bg-background-secondary dark:bg-slate-700/50 p-3.5 rounded-xl leading-relaxed border border-gray-100 dark:border-slate-700 transition-colors">
            <p className="flex items-start gap-2">
              <span className="inline-block w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              {t('apiConfig.info1')}
            </p>
            <p className="flex items-start gap-2 mt-1">
              <span className="inline-block w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              {t('apiConfig.info2')}
            </p>
            <p className="flex items-start gap-2 mt-1">
              <FiShield className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
              {t('apiConfig.info3')}
            </p>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-foreground-dark">
              <span className="w-6 h-6 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary flex items-center justify-center">
                <FiGlobe className="w-3.5 h-3.5" />
              </span>
              {t('apiConfig.baseUrl')}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark placeholder:text-foreground-subtle dark:placeholder:text-foreground-dark-subtle focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 focus:bg-white dark:focus:bg-slate-700 transition-all"
              placeholder="https://api.openai.com/v1"
            />
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-foreground-dark">
              <span className="w-6 h-6 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary flex items-center justify-center">
                <FiKey className="w-3.5 h-3.5" />
              </span>
              {t('apiConfig.apiKey')}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark placeholder:text-foreground-subtle dark:placeholder:text-foreground-dark-subtle focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 focus:bg-white dark:focus:bg-slate-700 transition-all"
              placeholder="sk-..."
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-foreground-dark">
              <span className="w-6 h-6 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary flex items-center justify-center">
                <FiCpu className="w-3.5 h-3.5" />
              </span>
              {t('apiConfig.model')}
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark placeholder:text-foreground-subtle dark:placeholder:text-foreground-dark-subtle focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 focus:bg-white dark:focus:bg-slate-700 transition-all"
              placeholder="gpt-..."
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-700 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.97] transition-all"
            >
              {t('apiConfig.save')}
            </button>
            <button
              onClick={handleClear}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 hover:shadow-md active:scale-[0.97] transition-all border border-red-100"
            >
              <FiTrash2 className="w-4 h-4" />
              {t('apiConfig.clear')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
