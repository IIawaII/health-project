import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  FiHardDrive,
  FiPlus,
  FiPlay,
  FiPause,
  FiTrash2,
  FiRefreshCw,
  FiDownload,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiLoader,
  FiAlertCircle,
  FiDatabase,
  FiFileText,
  FiCalendar,
  FiX,
  FiUpload,
  FiEye,
  FiLock,
} from 'react-icons/fi'
import { fetchWithTimeout } from '@/api/client'
import ConfirmDialog from '@/components/common/ConfirmDialog'

interface BackupTask {
  id: string
  name: string
  scope: string
  frequency: string
  retention_days: number
  is_paused: number
  last_run_at: number | null
  next_run_at: number | null
  created_at: number
  updated_at: number
}

interface BackupRecord {
  id: string
  task_id: string
  status: string
  scope: string
  size_bytes: number | null
  started_at: number | null
  completed_at: number | null
  error_message: string | null
  created_at: number
}

type ModalMode = 'create' | null

const defaultHeaders = { 'Content-Type': 'application/json' }

export default function BackupManagement() {
  const { t, i18n } = useTranslation()
  const [tasks, setTasks] = useState<BackupTask[]>([])
  const [records, setRecords] = useState<BackupRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<{ restoredTables: number; restoredConfigs: number; restoredKvKeys: number } | null>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [downloadTarget, setDownloadTarget] = useState<{ id: string; password: string } | null>(null)
  const [restorePassword, setRestorePassword] = useState('')
  const [previewData, setPreviewData] = useState<{
    meta: Record<string, unknown>
    tables: { name: string; rowCount: number; columns: string[] }[]
    kvNamespaces: { name: string; keyCount: number; sampleKeys: string[] }[]
    configs: { count: number; keys: string[] }
  } | null>(null)
  const [pendingRestoreData, setPendingRestoreData] = useState<Record<string, unknown> | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    scope: ['database'] as string[],
    frequency: 'manual' as string,
    retention_days: 30,
    encryptionPassword: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formTouched, setFormTouched] = useState<Record<string, boolean>>({})
  const modalRef = useRef<HTMLDivElement>(null)

  const resetForm = useCallback(() => {
    setFormData({ name: '', scope: ['database'], frequency: 'manual', retention_days: 30, encryptionPassword: '' })
    setFormErrors({})
    setFormTouched({})
  }, [])

  const closeModal = useCallback(() => {
    setModalMode(null)
    resetForm()
  }, [resetForm])

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {}
    if (!formData.name.trim()) {
      errors.name = t('backup.form.errors.nameRequired', '请输入备份名称')
    } else if (formData.name.length > 30) {
      errors.name = t('backup.form.errors.nameTooLong', '备份名称不能超过30个字符')
    }
    if (formData.scope.length === 0) {
      errors.scope = t('backup.form.errors.scopeRequired', '请至少选择一项备份内容')
    }
    return errors
  }, [formData, t])

  useEffect(() => {
    if (modalMode === 'create') {
      const errors = validateForm()
      setFormErrors(errors)
    }
  }, [formData, modalMode, validateForm])

  useEffect(() => {
    if (modalMode !== 'create') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handler)
    modalRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [modalMode, closeModal])

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '-'
    try {
      const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
      return new Date(timestamp * 1000).toLocaleString(locale)
    } catch {
      return String(timestamp)
    }
  }

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const getFrequencyLabel = (freq: string) => {
    const map: Record<string, string> = {
      manual: t('backup.frequency.manual', '手动'),
      daily: t('backup.frequency.daily', '每日'),
      weekly: t('backup.frequency.weekly', '每周'),
      monthly: t('backup.frequency.monthly', '每月'),
    }
    return map[freq] || freq
  }

  const getScopeLabel = (scopeStr: string) => {
    try {
      const scopes = JSON.parse(scopeStr) as string[]
      const map: Record<string, string> = {
        database: t('backup.scope.database', '数据库'),
        config: t('backup.scope.config', '配置'),
      }
      return scopes.map((s) => map[s] || s).join(', ')
    } catch {
      return scopeStr
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400">
            <FiCheckCircle className="w-3 h-3" />
            {t('backup.status.completed', '完成')}
          </span>
        )
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
            <FiLoader className="w-3 h-3 animate-spin" />
            {t('backup.status.running', '运行中')}
          </span>
        )
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <FiXCircle className="w-3 h-3" />
            {t('backup.status.failed', '失败')}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {t('backup.status.pending', '等待中')}
          </span>
        )
    }
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetchWithTimeout('/api/admin/backups', {
        headers: defaultHeaders,
        timeout: 15000,
      })
      const result = await response.json() as { data?: BackupTask[]; message?: string }
      if (response.ok && result.data) {
        setTasks(result.data)
      } else {
        setError(result.message || t('backup.errors.fetchFailed', '获取备份任务失败'))
      }
    } catch {
      setError(t('common.networkError', '网络错误'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchRecords = useCallback(async (taskId?: string) => {
    try {
      const url = taskId
        ? `/api/admin/backups?type=records&taskId=${taskId}`
        : '/api/admin/backups?type=records'
      const response = await fetchWithTimeout(url, {
        headers: defaultHeaders,
        timeout: 15000,
      })
      const result = await response.json() as { data?: BackupRecord[] }
      if (response.ok && result.data) {
        setRecords(result.data)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchRecords()
  }, [fetchTasks, fetchRecords])

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
    fetchTasks()
    fetchRecords(selectedTaskId ?? undefined)
  }, [fetchTasks, fetchRecords, selectedTaskId])

  const handleCreateTask = async () => {
    const errors = validateForm()
    setFormTouched({ name: true, scope: true, retention_days: true })
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    try {
      const response = await fetchWithTimeout('/api/admin/backups', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({
          ...formData,
          encryptionPassword: formData.encryptionPassword.trim() || undefined,
        }),
        timeout: 15000,
      })
      const result = await response.json() as { success?: boolean; message?: string }
      if (response.ok && result.success) {
        closeModal()
        fetchTasks()
      } else {
        setError(result.message || t('backup.errors.createFailed', '创建失败'))
      }
    } catch {
      setError(t('common.networkError', '网络错误'))
    }
  }

  const handleExecuteTask = async (taskId: string) => {
    setExecutingTaskId(taskId)
    try {
      const response = await fetchWithTimeout('/api/admin/backups', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({ action: 'execute', taskId }),
        timeout: 60000,
      })
      const result = await response.json() as { success?: boolean; message?: string }
      if (response.ok && result.success) {
        fetchTasks()
        fetchRecords(selectedTaskId ?? undefined)
      } else {
        setError(result.message || t('backup.errors.executeFailed', '执行失败'))
      }
    } catch {
      setError(t('common.networkError', '网络错误'))
    } finally {
      setExecutingTaskId(null)
    }
  }

  const handleTogglePause = async (taskId: string, isPaused: boolean) => {
    try {
      const response = await fetchWithTimeout(`/api/admin/backups/${taskId}`, {
        method: 'PATCH',
        headers: defaultHeaders,
        body: JSON.stringify({ is_paused: !isPaused }),
        timeout: 15000,
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch {
      setError(t('common.networkError', '网络错误'))
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      const response = await fetchWithTimeout(`/api/admin/backups/${taskId}`, {
        method: 'DELETE',
        headers: defaultHeaders,
        timeout: 15000,
      })
      if (response.ok) {
        setDeleteTarget(null)
        if (selectedTaskId === taskId) {
          setSelectedTaskId(null)
        }
        fetchTasks()
        fetchRecords()
      }
    } catch {
      setError(t('common.networkError', '网络错误'))
    }
  }

  const handleDownload = async (recordId: string, password?: string) => {
    try {
      const body: Record<string, unknown> = { action: 'download', recordId }
      if (password?.trim()) {
        body.encryptionPassword = password.trim()
      }
      const tokenRes = await fetchWithTimeout('/api/admin/backups', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(body),
        timeout: 15000,
      })
      const tokenData = await tokenRes.json() as { success?: boolean; data?: { token: string } }
      if (!tokenRes.ok || !tokenData.success || !tokenData.data?.token) {
        setError(t('backup.errors.downloadFailed', '下载失败'))
        return
      }

      const downloadUrl = `/api/admin/backups?type=download&token=${tokenData.data.token}`
      const response = await fetchWithTimeout(downloadUrl, { timeout: 60000 })
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `backup-${recordId}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch {
      setError(t('backup.errors.downloadFailed', '下载失败'))
    }
  }

  const handleRestore = async (file: File) => {
    setRestoring(true)
    setRestoreResult(null)
    setError('')
    setPreviewData(null)
    setPendingRestoreData(null)
    try {
      const text = await file.text()
      const backupData = JSON.parse(text)
      if (!backupData._meta && !backupData._encrypted) {
        setError(t('backup.errors.invalidBackupFile', '无效的备份文件格式'))
        return
      }

      setPendingRestoreData(backupData)

      const previewBody: Record<string, unknown> = { action: 'preview', data: backupData }
      if (backupData._encrypted) {
        if (!restorePassword.trim()) {
          setError(t('backup.errors.encryptionPasswordRequired', '加密备份需要提供解密密码'))
          setRestoring(false)
          return
        }
        previewBody.encryptionPassword = restorePassword.trim()
      }

      const previewRes = await fetchWithTimeout('/api/admin/backups', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(previewBody),
        timeout: 30000,
      })
      const previewResult = await previewRes.json() as {
        success?: boolean
        data?: {
          meta: Record<string, unknown>
          tables: { name: string; rowCount: number; columns: string[] }[]
          kvNamespaces: { name: string; keyCount: number; sampleKeys: string[] }[]
          configs: { count: number; keys: string[] }
        }
        message?: string
      }
      if (previewRes.ok && previewResult.success && previewResult.data) {
        setPreviewData(previewResult.data)
      } else {
        setError(previewResult.message || t('backup.errors.previewFailed', '预览失败'))
        setPendingRestoreData(null)
      }
    } catch {
      setError(t('backup.errors.restoreFailed', '恢复失败'))
    } finally {
      setRestoring(false)
    }
  }

  const handleConfirmRestore = async () => {
    if (!pendingRestoreData) return
    setRestoring(true)
    setError('')
    try {
      const tokenResponse = await fetchWithTimeout('/api/admin/backups', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({ action: 'request-restore' }),
        timeout: 10000,
      })
      const tokenResult = await tokenResponse.json() as { success?: boolean; data?: { confirmToken?: string }; message?: string }
      if (!tokenResponse.ok || !tokenResult.success || !tokenResult.data?.confirmToken) {
        setError(tokenResult.message || t('backup.errors.restoreFailed', '恢复失败'))
        setRestoring(false)
        return
      }

      const scope = (previewData?.meta?.scope as string[]) || ['database', 'config']
      const body: Record<string, unknown> = {
        action: 'restore',
        data: pendingRestoreData,
        scope,
        confirm: true,
        confirmToken: tokenResult.data.confirmToken,
      }
      if (pendingRestoreData._encrypted && restorePassword.trim()) {
        body.encryptionPassword = restorePassword.trim()
      }
      const response = await fetchWithTimeout('/api/admin/backups', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(body),
        timeout: 120000,
      })
      const result = await response.json() as { success?: boolean; data?: { restoredTables: number; restoredConfigs: number; restoredKvKeys: number }; message?: string }
      if (response.ok && result.success) {
        setRestoreResult(result.data ?? null)
        setPreviewData(null)
        setPendingRestoreData(null)
        setRestorePassword('')
      } else {
        setError(result.message || t('backup.errors.restoreFailed', '恢复失败'))
      }
    } catch {
      setError(t('backup.errors.restoreFailed', '恢复失败'))
    } finally {
      setRestoring(false)
    }
  }

  const handleViewRecords = (taskId: string) => {
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null)
      fetchRecords()
    } else {
      setSelectedTaskId(taskId)
      fetchRecords(taskId)
    }
  }

  const toggleScope = (scopeItem: string) => {
    setFormData((prev) => ({
      ...prev,
      scope: prev.scope.includes(scopeItem)
        ? prev.scope.filter((s) => s !== scopeItem)
        : [...prev.scope, scopeItem],
    }))
  }

  const filteredRecords = selectedTaskId
    ? records.filter((r) => r.task_id === selectedTaskId)
    : records

  const selectedTaskName = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId)?.name
    : null

  return (
    <div key={refreshKey} className="space-y-8 animate-fade-in">
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {t('backup.title', '备份任务')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t('backup.subtitle', '创建和管理系统备份任务')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              <FiRefreshCw className="w-4 h-4" />
              {t('backup.refresh', '刷新')}
            </button>
            <button
              onClick={() => setModalMode('create')}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 active:scale-[0.97] transition-all shadow-sm"
            >
              <FiPlus className="w-4 h-4" />
              {t('backup.createTask', '创建备份任务')}
            </button>
            <button
              onClick={() => setShowRestoreDialog(true)}
              disabled={restoring}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 active:scale-[0.97] transition-all shadow-sm disabled:opacity-50"
            >
              {restoring ? (
                <FiLoader className="w-4 h-4 animate-spin" />
              ) : (
                <FiUpload className="w-4 h-4" />
              )}
              {t('backup.restore', '导入恢复')}
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleRestore(file)
                e.target.value = ''
              }}
              className="hidden"
            />
          </div>
        </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse">
              <div className="h-5 bg-slate-100 dark:bg-slate-700 rounded w-1/3 mb-3" />
              <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-1/2 mb-2" />
              <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <FiHardDrive className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {t('backup.empty', '暂无备份任务，点击上方按钮创建')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`bg-white dark:bg-slate-800 rounded-xl border p-5 transition-all ${
                selectedTaskId === task.id
                  ? 'border-teal-300 dark:border-teal-700 shadow-sm shadow-teal-100 dark:shadow-teal-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:shadow-md'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    task.is_paused
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                      : 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                  }`}>
                    <FiHardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {task.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {getScopeLabel(task.scope)}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {getFrequencyLabel(task.frequency)}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {t('backup.retention', '保留 {{days}} 天', { days: task.retention_days })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {task.is_paused ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                      <FiPause className="w-3 h-3" />
                      {t('backup.paused', '已暂停')}
                    </span>
                  ) : task.frequency !== 'manual' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                      <FiClock className="w-3 h-3" />
                      {t('backup.active', '运行中')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      {t('backup.manual', '手动')}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <FiClock className="w-3.5 h-3.5" />
                  <span>{t('backup.lastRun', '上次运行')}:</span>
                  <span className="text-slate-700 dark:text-slate-200">{formatTime(task.last_run_at)}</span>
                </div>
                {task.frequency !== 'manual' && (
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <FiCalendar className="w-3.5 h-3.5" />
                    <span>{t('backup.nextRun', '下次运行')}:</span>
                    <span className="text-slate-700 dark:text-slate-200">{formatTime(task.next_run_at)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <FiFileText className="w-3.5 h-3.5" />
                  <span>{t('backup.createdAt', '创建时间')}:</span>
                  <span className="text-slate-700 dark:text-slate-200">{formatTime(task.created_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={() => handleExecuteTask(task.id)}
                  disabled={executingTaskId === task.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-50"
                >
                  {executingTaskId === task.id ? (
                    <FiLoader className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FiPlay className="w-3.5 h-3.5" />
                  )}
                  {t('backup.execute', '执行备份')}
                </button>
                {task.frequency !== 'manual' && (
                  <button
                    onClick={() => handleTogglePause(task.id, !!task.is_paused)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      task.is_paused
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                    }`}
                  >
                    {task.is_paused ? <FiPlay className="w-3.5 h-3.5" /> : <FiPause className="w-3.5 h-3.5" />}
                    {task.is_paused ? t('backup.resume', '恢复') : t('backup.pause', '暂停')}
                  </button>
                )}
                <button
                  onClick={() => handleViewRecords(task.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedTaskId === task.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <FiDatabase className="w-3.5 h-3.5" />
                  {t('backup.viewRecords', '查看记录')}
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: task.id, name: task.name })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors ml-auto"
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                  {t('backup.delete', '删除')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </section>

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {t('backup.recordsTitle', '备份记录')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {selectedTaskName
                ? t('backup.recordsSubtitleFiltered', '查看任务"{{name}}"的备份记录', { name: selectedTaskName })
                : t('backup.recordsSubtitle', '查看所有备份任务的执行记录')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedTaskId && (
              <button
                onClick={() => { setSelectedTaskId(null); fetchRecords() }}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all"
              >
                <FiX className="w-4 h-4" />
                {t('backup.viewAll', '查看全部')}
              </button>
            )}
          </div>
        </div>

        {filteredRecords.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('backup.table.status', '状态')}
                  </th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('backup.table.task', '任务名称')}
                  </th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('backup.table.scope', '范围')}
                  </th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('backup.table.size', '大小')}
                  </th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('backup.table.startedAt', '开始时间')}
                  </th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('backup.table.completedAt', '完成时间')}
                  </th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('backup.table.actions', '操作')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredRecords.slice(0, 20).map((record) => {
                  const taskName = tasks.find((t) => t.id === record.task_id)?.name || '-'
                  return (
                  <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-5 py-3">{getStatusBadge(record.status)}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300 text-sm">
                      {taskName}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {getScopeLabel(record.scope)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {formatSize(record.size_bytes)}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">
                      {formatTime(record.started_at)}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">
                      {formatTime(record.completed_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {record.status === 'completed' && (
                        <button
                          onClick={() => setDownloadTarget({ id: record.id, password: '' })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                        >
                          <FiDownload className="w-3 h-3" />
                          {t('backup.download', '下载')}
                        </button>
                      )}
                      {record.status === 'failed' && record.error_message && (
                        <span className="text-xs text-red-500 dark:text-red-400" title={record.error_message}>
                          {record.error_message.slice(0, 50)}
                        </span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <FiDatabase className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {selectedTaskId
                ? t('backup.noTaskRecords', '该任务暂无备份记录')
                : t('backup.noRecords', '暂无备份记录')}
            </p>
          </div>
        )}
      </section>

      {modalMode === 'create' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div
            ref={modalRef}
            tabIndex={-1}
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-modal-pop border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {t('backup.createTask', '创建备份任务')}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('backup.form.name', '备份名称')}
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, name: e.target.value }))
                    setFormTouched((p) => ({ ...p, name: true }))
                  }}
                  onBlur={() => setFormTouched((p) => ({ ...p, name: true }))}
                  placeholder={t('backup.form.namePlaceholder', '输入备份任务名称')}
                  className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-colors ${
                    formTouched.name && formErrors.name
                      ? 'border-red-300 dark:border-red-600'
                      : 'border-slate-200 dark:border-slate-600'
                  }`}
                />
                {formTouched.name && formErrors.name && (
                  <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                    <FiAlertCircle className="w-3 h-3 flex-shrink-0" />
                    {formErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('backup.form.scope', '备份内容')}
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <div className="flex gap-3">
                  {['database', 'config'].map((scopeItem) => (
                    <label
                      key={scopeItem}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                        formData.scope.includes(scopeItem)
                          ? 'border-teal-300 dark:border-teal-600 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300'
                          : formTouched.scope && formErrors.scope
                            ? 'border-red-300 dark:border-red-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.scope.includes(scopeItem)}
                        onChange={() => {
                          toggleScope(scopeItem)
                          setFormTouched((p) => ({ ...p, scope: true }))
                        }}
                        className="sr-only"
                      />
                      {scopeItem === 'database' ? (
                        <FiDatabase className="w-4 h-4" />
                      ) : (
                        <FiFileText className="w-4 h-4" />
                      )}
                      <span className="text-sm">
                        {scopeItem === 'database'
                          ? t('backup.scope.database', '数据库')
                          : t('backup.scope.config', '配置')}
                      </span>
                    </label>
                  ))}
                </div>
                {formTouched.scope && formErrors.scope && (
                  <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                    <FiAlertCircle className="w-3 h-3 flex-shrink-0" />
                    {formErrors.scope}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('backup.form.frequency', '备份频率')}
                </label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData((p) => ({ ...p, frequency: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="manual">{t('backup.frequency.manual', '手动触发')}</option>
                  <option value="daily">{t('backup.frequency.daily', '每日')}</option>
                  <option value="weekly">{t('backup.frequency.weekly', '每周')}</option>
                  <option value="monthly">{t('backup.frequency.monthly', '每月')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('backup.form.retention', '保留天数')}
                </label>
                <select
                  value={formData.retention_days}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, retention_days: parseInt(e.target.value, 10) }))
                    setFormTouched((p) => ({ ...p, retention_days: true }))
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value={7}>{t('backup.retentionDays.7', '7 天')}</option>
                  <option value={30}>{t('backup.retentionDays.30', '30 天')}</option>
                  <option value={90}>{t('backup.retentionDays.90', '90 天')}</option>
                  <option value={180}>{t('backup.retentionDays.180', '180 天')}</option>
                  <option value={365}>{t('backup.retentionDays.365', '365 天')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <FiLock className="w-3.5 h-3.5" />
                    {t('backup.form.encryptionPassword', '加密密码')}
                    <span className="text-xs text-slate-400 font-normal">({t('backup.form.optional', '可选')})</span>
                  </span>
                </label>
                <input
                  type="password"
                  value={formData.encryptionPassword}
                  onChange={(e) => setFormData((p) => ({ ...p, encryptionPassword: e.target.value }))}
                  placeholder={t('backup.form.encryptionPasswordPlaceholder', '留空则不加密')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 outline-none"
                />
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {t('backup.form.encryptionPasswordHint', '设置后，下载和恢复时需要提供此密码')}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                onClick={handleCreateTask}
                disabled={Object.keys(formErrors).length > 0}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('backup.form.submit', '创建')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title={t('backup.deleteConfirm.title', '删除备份任务')}
          message={t('backup.deleteConfirm.message', '确定要删除备份任务"{{name}}"吗？所有相关备份记录也将被删除，此操作不可撤销。', { name: deleteTarget.name })}
          variant="danger"
          onConfirm={() => handleDeleteTask(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {previewData && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setPreviewData(null); setPendingRestoreData(null) }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-modal-pop border border-slate-200 dark:border-slate-700 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FiEye className="w-5 h-5 text-blue-500" />
                {t('backup.previewTitle', '恢复预览')}
              </h2>
              <button
                onClick={() => { setPreviewData(null); setPendingRestoreData(null) }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 dark:text-slate-400">
                <p>{t('backup.previewExportedAt', '导出时间')}: {String(previewData.meta?.exportedAt ?? '-')}</p>
                <p>{t('backup.previewVersion', '版本')}: {String(previewData.meta?.version ?? '-')}</p>
              </div>
              {previewData.tables.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                    <FiDatabase className="w-4 h-4" />
                    {t('backup.previewTables', '数据表')} ({previewData.tables.length})
                  </h3>
                  <div className="space-y-1.5">
                    {previewData.tables.map((tbl) => (
                      <div key={tbl.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-600 text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{tbl.name}</span>
                        <span className="text-slate-400">{tbl.rowCount} {t('backup.previewRows', '行')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewData.kvNamespaces.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                    <FiHardDrive className="w-4 h-4" />
                    KV {t('backup.previewNamespaces', '命名空间')}
                  </h3>
                  <div className="space-y-1.5">
                    {previewData.kvNamespaces.map((ns) => (
                      <div key={ns.name} className="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-600 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{ns.name}</span>
                          <span className="text-slate-400">{ns.keyCount} keys</span>
                        </div>
                        {ns.sampleKeys.length > 0 && (
                          <div className="mt-1 text-slate-400 truncate">{ns.sampleKeys.join(', ')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewData.configs.count > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                    <FiFileText className="w-4 h-4" />
                    {t('backup.previewConfigs', '配置项')} ({previewData.configs.count})
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {previewData.configs.keys.map((k) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300">{k}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => { setPreviewData(null); setPendingRestoreData(null) }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={restoring}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {restoring ? <FiLoader className="w-4 h-4 animate-spin" /> : null}
                {t('backup.confirmRestore', '确认恢复')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {restoreResult && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRestoreResult(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-modal-pop border border-slate-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {t('backup.restoreResult', '恢复结果')}
              </h2>
              <button
                onClick={() => setRestoreResult(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                <FiCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="text-sm text-green-700 dark:text-green-300">
                  {t('backup.restoreSuccess', '恢复操作已完成')}
                </span>
              </div>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {restoreResult.restoredTables > 0 && (
                  <p>{t('backup.restoredTables', '已恢复 {{count}} 个数据表', { count: restoreResult.restoredTables })}</p>
                )}
                {restoreResult.restoredConfigs > 0 && (
                  <p>{t('backup.restoredConfigs', '已恢复 {{count}} 项配置', { count: restoreResult.restoredConfigs })}</p>
                )}
                {restoreResult.restoredKvKeys > 0 && (
                  <p>{t('backup.restoredKvKeys', '已恢复 {{count}} 个 KV 键值', { count: restoreResult.restoredKvKeys })}</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setRestoreResult(null)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
              >
                {t('common.close', '关闭')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRestoreDialog && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRestoreDialog(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-modal-pop border border-slate-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FiUpload className="w-5 h-5 text-blue-500" />
                {t('backup.restore', '导入恢复')}
              </h2>
              <button
                onClick={() => setShowRestoreDialog(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('backup.restoreDialogDesc', '选择备份文件进行恢复。如果备份文件已加密，请输入解密密码。')}
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <FiLock className="w-3.5 h-3.5" />
                    {t('backup.restorePassword', '解密密码')}
                    <span className="text-xs text-slate-400 font-normal">({t('backup.form.optional', '可选')})</span>
                  </span>
                </label>
                <input
                  type="password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder={t('backup.restorePasswordPlaceholder', '未加密的备份请留空')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setShowRestoreDialog(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                onClick={() => {
                  setShowRestoreDialog(false)
                  restoreInputRef.current?.click()
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <FiUpload className="w-4 h-4" />
                {t('backup.selectFile', '选择文件')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {downloadTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDownloadTarget(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-modal-pop border border-slate-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FiDownload className="w-5 h-5 text-teal-500" />
                {t('backup.download', '下载备份')}
              </h2>
              <button
                onClick={() => setDownloadTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('backup.downloadDialogDesc', '如需加密备份文件，请输入加密密码。留空则下载未加密的备份。')}
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <FiLock className="w-3.5 h-3.5" />
                    {t('backup.form.encryptionPassword', '加密密码')}
                    <span className="text-xs text-slate-400 font-normal">({t('backup.form.optional', '可选')})</span>
                  </span>
                </label>
                <input
                  type="password"
                  value={downloadTarget.password}
                  onChange={(e) => setDownloadTarget((prev) => prev ? { ...prev, password: e.target.value } : null)}
                  placeholder={t('backup.form.encryptionPasswordPlaceholder', '留空则不加密')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setDownloadTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                onClick={() => {
                  handleDownload(downloadTarget.id, downloadTarget.password)
                  setDownloadTarget(null)
                }}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors flex items-center gap-2"
              >
                <FiDownload className="w-4 h-4" />
                {t('backup.download', '下载')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
