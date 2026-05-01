import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiSettings,
  FiEdit2,
  FiCheck,
  FiX,
  FiRefreshCw,
  FiToggleLeft,
  FiToggleRight,
  FiHash,
  FiAlertCircle,
  FiShield,
  FiCpu,
  FiServer,
  FiLock,
  FiMail,
} from 'react-icons/fi'
import { useAdminConfig } from '@/hooks/useAdmin'
import { refreshClientConfig } from '@/hooks/useClientConfig'
import ConfirmDialog from '@/components/common/ConfirmDialog'

interface ConfigMeta {
  type: 'text' | 'number' | 'boolean'
  icon: React.ElementType
  multiline?: boolean
  min?: number
  max?: number
  unit?: string
  defaultValue?: string
  group: 'switches' | 'ai' | 'security' | 'email'
  requiresConfirm?: boolean
}

const CONFIG_META: Record<string, ConfigMeta> = {
  maintenance_mode: { type: 'boolean', icon: FiShield, group: 'switches', requiresConfirm: true, defaultValue: 'false' },
  enable_registration: { type: 'boolean', icon: FiShield, group: 'switches', requiresConfirm: true, defaultValue: 'true' },
  max_requests_per_day: { type: 'number', icon: FiHash, group: 'ai', min: 0, max: 10000, unit: '次/天', defaultValue: '50' },
  max_request_body_size: { type: 'number', icon: FiServer, group: 'security', min: 1048576, max: 104857600, unit: '字节', defaultValue: '10485760' },
  max_login_failures: { type: 'number', icon: FiLock, group: 'security', min: 1, max: 20, unit: '次', defaultValue: '5' },
  account_lockout_seconds: { type: 'number', icon: FiLock, group: 'security', min: 60, max: 86400, unit: '秒', defaultValue: '900' },
  smtp_timeout_ms: { type: 'number', icon: FiMail, group: 'email', min: 5000, max: 60000, unit: 'ms', defaultValue: '15000' },
  metrics_sample_rate: { type: 'number', icon: FiCpu, group: 'ai', min: 0, max: 1, defaultValue: '0.1' },
}

const CONFIG_GROUPS = [
  { key: 'switches', icon: FiShield },
  { key: 'ai', icon: FiCpu },
  { key: 'security', icon: FiLock },
  { key: 'email', icon: FiMail },
] as const

const FLOAT_CONFIG_KEYS = new Set(['metrics_sample_rate'])

function ToggleSwitch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
        enabled
          ? 'bg-teal-600'
          : 'bg-slate-200 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function SystemConfig() {
  const { t, i18n } = useTranslation()
  const { data, loading, error, refetch, updateConfigs } = useAdminConfig()
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [saveFeedback, setSaveFeedback] = useState<{
    key: string
    success: boolean
  } | null>(null)
  const [pendingToggle, setPendingToggle] = useState<{
    key: string
    newValue: string
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const configDisplayNames = useMemo<Record<string, string>>(
    () => ({
      max_requests_per_day: t('systemConfig.displayNames.max_requests_per_day'),
      maintenance_mode: t('systemConfig.displayNames.maintenance_mode'),
      enable_registration: t('systemConfig.displayNames.enable_registration'),
      max_request_body_size: t('systemConfig.displayNames.max_request_body_size'),
      max_login_failures: t('systemConfig.displayNames.max_login_failures'),
      account_lockout_seconds: t('systemConfig.displayNames.account_lockout_seconds'),
      smtp_timeout_ms: t('systemConfig.displayNames.smtp_timeout_ms'),
      metrics_sample_rate: t('systemConfig.displayNames.metrics_sample_rate'),
    }),
    [t]
  )

  const configDescriptions = useMemo<Record<string, string>>(
    () => ({
      max_requests_per_day: t('systemConfig.descriptions.max_requests_per_day'),
      maintenance_mode: t('systemConfig.descriptions.maintenance_mode'),
      enable_registration: t('systemConfig.descriptions.enable_registration'),
      max_request_body_size: t('systemConfig.descriptions.max_request_body_size'),
      max_login_failures: t('systemConfig.descriptions.max_login_failures'),
      account_lockout_seconds: t('systemConfig.descriptions.account_lockout_seconds'),
      smtp_timeout_ms: t('systemConfig.descriptions.smtp_timeout_ms'),
      metrics_sample_rate: t('systemConfig.descriptions.metrics_sample_rate'),
    }),
    [t]
  )

  const showFeedback = useCallback(
    (key: string, success: boolean) => {
      setSaveFeedback({ key, success })
      const timer = setTimeout(() => setSaveFeedback(null), 2000)
      return () => clearTimeout(timer)
    },
    []
  )

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
    refetch()
  }, [refetch])

  const validateNumber = useCallback((key: string, value: string): string | null => {
    const meta = CONFIG_META[key]
    if (!meta || meta.type !== 'number') return null
    const num = Number(value)
    if (isNaN(num)) {
      return t('systemConfig.validation.numberInvalid')
    }
    if (!FLOAT_CONFIG_KEYS.has(key) && !Number.isInteger(num)) {
      return t('systemConfig.validation.numberInteger')
    }
    if (meta.min !== undefined && num < meta.min) {
      return t('systemConfig.validation.numberMin', { min: meta.min })
    }
    if (meta.max !== undefined && num > meta.max) {
      return t('systemConfig.validation.numberMax', { max: meta.max })
    }
    return null
  }, [t])

  const handleSave = async (key: string, value: string) => {
    const validationError = validateNumber(key, value)
    if (validationError) {
      showFeedback(key, false)
      return
    }

    setSavingKey(key)
    try {
      const ok = await updateConfigs({ [key]: value })
      if (ok) {
        setEditingKey(null)
        showFeedback(key, true)
        refreshClientConfig()
        refetch()
      } else {
        showFeedback(key, false)
      }
    } catch {
      showFeedback(key, false)
    } finally {
      setSavingKey(null)
    }
  }

  const startEdit = (key: string, value: string) => {
    setEditingKey(key)
    setEditValue(value)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter' && !CONFIG_META[key]?.multiline) {
      e.preventDefault()
      handleSave(key, editValue)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const handleBooleanToggle = (key: string, currentValue: string) => {
    const newValue = currentValue === 'true' ? 'false' : 'true'
    const meta = CONFIG_META[key]
    if (meta?.requiresConfirm) {
      setPendingToggle({ key, newValue })
      return
    }
    executeToggle(key, newValue)
  }

  const executeToggle = async (key: string, newValue: string) => {
    setSavingKey(key)
    try {
      const ok = await updateConfigs({ [key]: newValue })
      if (ok) {
        showFeedback(key, true)
        refreshClientConfig()
        refetch()
      } else {
        showFeedback(key, false)
      }
    } catch {
      showFeedback(key, false)
    } finally {
      setSavingKey(null)
    }
  }

  const handleConfirmToggle = () => {
    if (!pendingToggle) return
    executeToggle(pendingToggle.key, pendingToggle.newValue)
    setPendingToggle(null)
  }

  useEffect(() => {
    if (editingKey && !CONFIG_META[editingKey]?.multiline && inputRef.current) {
      inputRef.current.focus()
    }
    if (editingKey && CONFIG_META[editingKey]?.multiline && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editingKey])

  const formatTime = (timestamp: number) => {
    try {
      const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
      return new Date(timestamp * 1000).toLocaleString(locale)
    } catch {
      return String(timestamp)
    }
  }

  const getActiveWarning = (key: string, value: string): string | null => {
    if (key === 'maintenance_mode' && value === 'true') {
      return t('systemConfig.activeWarnings.maintenance')
    }
    if (key === 'enable_registration' && value === 'false') {
      return t('systemConfig.activeWarnings.registrationClosed')
    }
    return null
  }

  const getConfirmDialog = () => {
    if (!pendingToggle) return null
    const { key, newValue } = pendingToggle
    const isEnabling = newValue === 'true'

    if (key === 'maintenance_mode') {
      return isEnabling
        ? { title: t('systemConfig.confirm.maintenanceEnable.title'), message: t('systemConfig.confirm.maintenanceEnable.message'), variant: 'danger' as const }
        : { title: t('systemConfig.confirm.maintenanceDisable.title'), message: t('systemConfig.confirm.maintenanceDisable.message'), variant: 'warning' as const }
    }
    if (key === 'enable_registration') {
      return isEnabling
        ? { title: t('systemConfig.confirm.registrationEnable.title'), message: t('systemConfig.confirm.registrationEnable.message'), variant: 'warning' as const }
        : { title: t('systemConfig.confirm.registrationDisable.title'), message: t('systemConfig.confirm.registrationDisable.message'), variant: 'danger' as const }
    }
    return null
  }

  const formatDisplayValue = (key: string, value: string): string => {
    const meta = CONFIG_META[key]
    if (key === 'max_request_body_size' && meta?.type === 'number') {
      const bytes = Number(value)
      if (!isNaN(bytes) && bytes >= 1048576) {
        return `${(bytes / 1048576).toFixed(0)} MB (${Number(value).toLocaleString()} 字节)`
      }
      if (!isNaN(bytes) && bytes >= 1024) {
        return `${(bytes / 1024).toFixed(0)} KB (${Number(value).toLocaleString()} 字节)`
      }
    }
    if (meta?.type === 'number' && !isNaN(Number(value))) {
      return Number(value).toLocaleString()
    }
    return value
  }

  const renderValue = (config: { key: string; value: string }) => {
    const meta = CONFIG_META[config.key] || { type: 'text', icon: FiSettings, group: 'site' }

    if (meta.type === 'boolean') {
      const enabled = config.value === 'true'
      return (
        <div className="flex items-center gap-3">
          <ToggleSwitch
            enabled={enabled}
            onChange={() => handleBooleanToggle(config.key, config.value)}
            disabled={savingKey === config.key}
          />
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              enabled
                ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
            }`}
          >
            {enabled ? (
              <>
                <FiToggleRight className="w-3.5 h-3.5" />
                {t('common.on', 'ON')}
              </>
            ) : (
              <>
                <FiToggleLeft className="w-3.5 h-3.5" />
                {t('common.off', 'OFF')}
              </>
            )}
          </span>
        </div>
      )
    }

    if (editingKey === config.key) {
      if (meta.multiline) {
        return (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, config.key)}
              disabled={savingKey === config.key}
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 outline-none disabled:opacity-60 resize-y"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave(config.key, editValue)}
                disabled={savingKey === config.key}
                className="p-2 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                title={t('common.save')}
              >
                <FiCheck className="w-4 h-4" />
              </button>
              <button
                onClick={cancelEdit}
                disabled={savingKey === config.key}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                title={t('common.cancel')}
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      }

      return (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type={meta.type === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, config.key)}
            disabled={savingKey === config.key}
            min={meta.min}
            max={meta.max}
            step={FLOAT_CONFIG_KEYS.has(config.key) ? 'any' : '1'}
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 outline-none disabled:opacity-60"
          />
          {meta.unit && (
            <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{meta.unit}</span>
          )}
          <button
            onClick={() => handleSave(config.key, editValue)}
            disabled={savingKey === config.key}
            className="p-2 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
            title={t('common.save')}
          >
            <FiCheck className="w-4 h-4" />
          </button>
          <button
            onClick={cancelEdit}
            disabled={savingKey === config.key}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            title={t('common.cancel')}
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )
    }

    return (
      <div className="group flex items-center justify-between gap-3">
        <p className="text-sm text-slate-700 dark:text-slate-200 break-all line-clamp-2">
          {formatDisplayValue(config.key, config.value)}
          {meta.unit && (
            <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500 font-normal">
              {meta.unit}
            </span>
          )}
        </p>
        <button
          onClick={() => startEdit(config.key, config.value)}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 opacity-0 group-hover:opacity-100 transition-all"
          title={t('common.save')}
        >
          <FiEdit2 className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  const groupedConfigs = useMemo(() => {
    if (!data) return {}
    const groups: Record<string, typeof data> = {}
    for (const config of data) {
      const meta = CONFIG_META[config.key]
      const group = meta?.group || 'site'
      if (!groups[group]) groups[group] = []
      groups[group].push(config)
    }
    return groups
  }, [data])

  const confirmDialogProps = getConfirmDialog()

  return (
    <div key={refreshKey} className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {t('systemConfig.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('systemConfig.subtitle')}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <FiRefreshCw className="w-4 h-4" />
          {t('systemConfig.refresh')}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-8">
          {CONFIG_GROUPS.map((group) => (
            <div key={group.key}>
              <div className="h-5 w-24 bg-slate-100 dark:bg-slate-700 rounded mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-1/3" />
                        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
                      </div>
                    </div>
                    <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded" />
                    <div className="mt-3 h-3 bg-slate-100 dark:bg-slate-700 rounded w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-8">
          {CONFIG_GROUPS.map((group) => {
            const configs = groupedConfigs[group.key]
            if (!configs || configs.length === 0) return null
            const GroupIcon = group.icon

            return (
              <div key={group.key}>
                <div className="flex items-center gap-2 mb-4">
                  <GroupIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
                    {t(`systemConfig.groups.${group.key}`)}
                  </h2>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {t(`systemConfig.groups.${group.key}Desc`)}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {configs.map((config) => {
                    const meta = CONFIG_META[config.key] || {
                      type: 'text',
                      icon: FiSettings,
                      group: 'site',
                    }
                    const Icon = meta.icon
                    const isEditing = editingKey === config.key
                    const isBoolean = meta.type === 'boolean'
                    const feedback = saveFeedback?.key === config.key
                    const activeWarning = getActiveWarning(config.key, config.value)

                    return (
                      <div
                        key={config.key}
                        className={`relative bg-white dark:bg-slate-800 rounded-xl border p-5 transition-all ${
                          activeWarning
                            ? 'border-amber-200 dark:border-amber-800'
                            : feedback
                              ? saveFeedback.success
                                ? 'border-green-300 dark:border-green-700 shadow-sm shadow-green-100 dark:shadow-green-900/20'
                                : 'border-red-300 dark:border-red-700 shadow-sm shadow-red-100 dark:shadow-red-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:shadow-md'
                        }`}
                      >
                        {feedback && (
                          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium animate-fade-in">
                            {saveFeedback.success ? (
                              <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                <FiCheck className="w-3 h-3" />
                                {t('systemConfig.saved')}
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                <FiAlertCircle className="w-3 h-3" />
                                {t('systemConfig.saveFailed')}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-start gap-3 mb-3">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isBoolean && config.value === 'true'
                                ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                                : 'bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                              {configDisplayNames[config.key] || config.key}
                            </h3>
                          </div>
                          {!isBoolean && !isEditing && (
                            <button
                              onClick={() => startEdit(config.key, config.value)}
                              className="shrink-0 p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                              title={t('common.save')}
                            >
                              <FiEdit2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
                          {configDescriptions[config.key] || ''}
                          {meta.defaultValue && (
                            <span className="block mt-0.5 text-slate-400/70 dark:text-slate-500/70">
                              {t('systemConfig.defaultValue')}: {formatDisplayValue(config.key, meta.defaultValue)}{meta.unit ? ` ${meta.unit}` : ''}
                            </span>
                          )}
                        </p>

                        {activeWarning && (
                          <div className="mb-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                            {activeWarning}
                          </div>
                        )}

                        <div className="min-h-[2.5rem]">{renderValue(config)}</div>

                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {t('systemConfig.updatedAt')}: {formatTime(config.updated_at)}
                          </span>
                          {savingKey === config.key && (
                            <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                              <span className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                              {t('common.loading')}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
            <FiSettings className="w-7 h-7 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('systemConfig.noConfig')}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {t('systemConfig.noConfigDesc')}
          </p>
        </div>
      )}

      {confirmDialogProps && (
        <ConfirmDialog
          open={!!pendingToggle}
          title={confirmDialogProps.title}
          message={confirmDialogProps.message}
          variant={confirmDialogProps.variant}
          confirmLabel={t('systemConfig.confirm.confirm')}
          cancelLabel={t('systemConfig.confirm.cancel')}
          onConfirm={handleConfirmToggle}
          onCancel={() => setPendingToggle(null)}
        />
      )}
    </div>
  )
}
