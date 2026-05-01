import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiChevronLeft,
  FiChevronRight,
  FiActivity,
  FiMessageSquare,
  FiClipboard,
  FiHelpCircle,
  FiFileText,
  FiShield,
  FiRefreshCw,
} from 'react-icons/fi'
import { useAdminLogs, useAdminAuditLogs } from '@/hooks/useAdmin'

const actionConfig: Record<string, { labelKey: string; color: string; icon: React.ElementType }> = {
  analyze: { labelKey: 'dashboard.actions.analyze', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400', icon: FiFileText },
  chat: { labelKey: 'dashboard.actions.chat', color: 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400', icon: FiMessageSquare },
  plan: { labelKey: 'dashboard.actions.plan', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400', icon: FiClipboard },
  quiz: { labelKey: 'dashboard.actions.quiz', color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400', icon: FiHelpCircle },
}

function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation()
  const config = actionConfig[action] || { labelKey: action, color: 'bg-slate-50 text-slate-600 dark:bg-slate-700 dark:text-slate-400', icon: FiActivity }
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="w-3 h-3" />
      {t(config.labelKey)}
    </span>
  )
}

export default function DataManagement() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<'usage' | 'audit'>('usage')
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const pageSize = 15

  const {
    data: usageData,
    loading: usageLoading,
    error: usageError,
    refetch: refetchUsage,
  } = useAdminLogs(page, pageSize, actionFilter || undefined)

  const {
    data: auditData,
    loading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useAdminAuditLogs(page, pageSize, auditActionFilter || undefined)

  const totalPages = activeTab === 'usage'
    ? (usageData ? Math.ceil(usageData.total / pageSize) : 0)
    : (auditData ? Math.ceil(auditData.total / pageSize) : 0)

  const loading = activeTab === 'usage' ? usageLoading : auditLoading
  const error = activeTab === 'usage' ? usageError : auditError

  return (
    <div key={refreshKey} className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('dataManagement.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('dataManagement.subtitle')}</p>
        </div>
        <button
          onClick={() => { setRefreshKey((k) => k + 1); refetchUsage(); refetchAudit() }}
          disabled={usageLoading || auditLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${usageLoading || auditLoading ? 'animate-spin' : ''}`} />
          {t('dataManagement.refresh', '刷新')}
        </button>
      </div>

      {/* Tabs, Filters & Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-1 shadow-sm">
          <button
            onClick={() => { setActiveTab('usage'); setPage(1) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'usage'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {t('dataManagement.tabs.usage')}
          </button>
          <button
            onClick={() => { setActiveTab('audit'); setPage(1) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'audit'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {t('dataManagement.tabs.audit')}
          </button>
        </div>

        {activeTab === 'usage' ? (
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
          >
            <option value="">{t('dataManagement.filters.allActions')}</option>
            <option value="analyze">{t('dataManagement.filters.analyze')}</option>
            <option value="chat">{t('dataManagement.filters.chat')}</option>
            <option value="plan">{t('dataManagement.filters.plan')}</option>
            <option value="quiz">{t('dataManagement.filters.quiz')}</option>
          </select>
        ) : (
          <select
            value={auditActionFilter}
            onChange={(e) => { setAuditActionFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
          >
            <option value="">{t('dataManagement.filters.allActions')}</option>
            <option value="UPDATE_SYSTEM_CONFIG">{t('dataManagement.filters.updateSystemConfig')}</option>
            <option value="UPDATE_USER_ROLE">{t('dataManagement.filters.updateUserRole')}</option>
            <option value="DELETE_USER">{t('dataManagement.filters.deleteUser')}</option>
            <option value="CREATE_BACKUP_TASK">{t('dataManagement.filters.createBackupTask')}</option>
            <option value="UPDATE_BACKUP_TASK">{t('dataManagement.filters.updateBackupTask')}</option>
            <option value="DELETE_BACKUP_TASK">{t('dataManagement.filters.deleteBackupTask')}</option>
            <option value="EXECUTE_BACKUP">{t('dataManagement.filters.executeBackup')}</option>
            <option value="RESTORE_BACKUP">{t('dataManagement.filters.restoreBackup')}</option>
            <option value="CLEAR_USAGE_LOGS">{t('dataManagement.filters.clearUsageLogs')}</option>
          </select>
        )}

        <div className="flex-1" />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-medium border-b border-slate-200 dark:border-slate-700">
              <tr>
                {activeTab === 'usage' ? (
                  <>
                    <th className="px-4 py-3">{t('dataManagement.columns.actionType')}</th>
                    <th className="px-4 py-3">{t('dataManagement.columns.userId')}</th>
                    <th className="px-4 py-3">{t('dataManagement.columns.metadata')}</th>
                    <th className="px-4 py-3">{t('dataManagement.columns.time')}</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3">{t('dataManagement.columns.action')}</th>
                    <th className="px-4 py-3">{t('dataManagement.columns.admin')}</th>
                    <th className="px-4 py-3">{t('dataManagement.columns.target')}</th>
                    <th className="px-4 py-3">{t('dataManagement.columns.details')}</th>
                    <th className="px-4 py-3">{t('dataManagement.columns.time')}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={activeTab === 'usage' ? 4 : 5} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : activeTab === 'usage' ? (
                usageData?.logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                      {t('dataManagement.noUsageLogs')}
                    </td>
                  </tr>
                ) : (
                  usageData?.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <span className="font-medium">{log.username ?? t('dataManagement.anonymous')}</span>
                        {log.user_id && (
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{log.user_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {log.metadata ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {new Date(log.created_at * 1000).toLocaleString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US')}
                      </td>
                    </tr>
                  ))
                )
              ) : (
                auditData?.logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                      {t('dataManagement.noAuditLogs')}
                    </td>
                  </tr>
                ) : (
                  auditData?.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                          <FiShield className="w-3 h-3" />
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-xs">{log.admin_id}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {log.target_type ? `${log.target_type}:${log.target_id}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">{log.details ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {new Date(log.created_at * 1000).toLocaleString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US')}
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('dataManagement.pagination', { total: (activeTab === 'usage' ? usageData?.total : auditData?.total) ?? 0, page, totalPages })}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
