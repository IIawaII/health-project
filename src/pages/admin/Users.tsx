import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiChevronLeft,
  FiChevronRight,
  FiUser,
  FiShield,
  FiCheck,
  FiX,
  FiLock,
  FiAlertTriangle,
  FiRefreshCw,
} from 'react-icons/fi'
import { useAdminUsers } from '@/hooks/useAdmin'
import { useAuth } from '@/contexts/AuthContext'
import Avatar from '@/components/common/Avatar'

const SYSTEM_ADMIN_ID = 'system-admin'

const roleBadge = (role: string, t: (k: string) => string) => {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
        <FiShield className="w-3 h-3" />
        {t('users.roles.admin')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
      <FiUser className="w-3 h-3" />
      {t('users.roles.user')}
    </span>
  )
}

export default function Users() {
  const { t, i18n } = useTranslation()
  const { user: currentUser } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [upgradeConfirm, setUpgradeConfirm] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const pageSize = 10

  const isSystemAdmin = currentUser?.id === SYSTEM_ADMIN_ID

  const { data, loading, error, refetch, updateUserRole, deleteUser } = useAdminUsers(page, pageSize, search)

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const handleUpdateRole = async (id: string) => {
    setActionError(null)
    if (editRole === 'admin' && id !== SYSTEM_ADMIN_ID) {
      setUpgradeConfirm(id)
      return
    }
    const result = await updateUserRole(id, editRole)
    if (result.ok) {
      setEditingId(null)
      refetch()
    } else {
      setActionError(result.message || t('users.errors.updateFailed'))
    }
  }

  const confirmUpgrade = async () => {
    const id = upgradeConfirm
    setUpgradeConfirm(null)
    if (!id) return
    const result = await updateUserRole(id, editRole)
    if (result.ok) {
      setEditingId(null)
      refetch()
    } else {
      setActionError(result.message || t('users.errors.updateFailed'))
    }
  }

  const handleDelete = async (id: string) => {
    setActionError(null)
    const result = await deleteUser(id)
    if (result.ok) {
      setDeletingId(null)
      refetch()
    } else {
      setActionError(result.message || t('users.errors.deleteFailed'))
    }
  }

  const canEditUser = (user: { id: string; role: string }) => {
    if (user.id === SYSTEM_ADMIN_ID) return false
    if (user.role === 'admin' && !isSystemAdmin) return false
    return true
  }

  const canDeleteUser = (user: { id: string; role: string }) => {
    if (user.id === currentUser?.id) return false
    if (user.id === SYSTEM_ADMIN_ID) return false
    if (user.role === 'admin' && !isSystemAdmin) return false
    return true
  }

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div key={refreshKey} className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('users.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('users.subtitle')}</p>
        </div>
        <button
          onClick={() => { setRefreshKey((k) => k + 1); refetch() }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('users.refresh', '刷新')}
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm transition-colors">
        <div className="flex-1 relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('users.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
        >
          {t('users.search')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-medium border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">{t('users.columns.user')}</th>
                <th className="px-4 py-3">{t('users.columns.email')}</th>
                <th className="px-4 py-3">{t('users.columns.role')}</th>
                <th className="px-4 py-3">{t('users.columns.createdAt')}</th>
                <th className="px-4 py-3 text-right">{t('users.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                    {t('users.noData')}
                  </td>
                </tr>
              ) : (
                data?.users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <Avatar avatar={user.avatar} size={32} className="object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-xs font-bold">
                            {user.username[0]?.toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-slate-800 dark:text-slate-100">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email}</td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-teal-500 outline-none"
                        >
                          <option value="user" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100">{t('users.roles.user')}</option>
                          <option value="admin" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100">{t('users.roles.admin')}</option>
                        </select>
                      ) : (
                        roleBadge(user.role, t)
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(user.created_at * 1000).toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {editingId === user.id ? (
                          <>
                            <button
                              onClick={() => handleUpdateRole(user.id)}
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                              title={t('users.actions.confirm')}
                            >
                              <FiCheck className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                              title={t('users.actions.cancel')}
                            >
                              <FiX className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            {canEditUser(user) ? (
                              <button
                                onClick={() => {
                                  setEditingId(user.id)
                                  setEditRole(user.role)
                                }}
                                className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50 transition-colors"
                                title={t('users.actions.edit')}
                              >
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="p-1.5 text-slate-300 dark:text-slate-600" title={t('users.actions.noPermission')}>
                                <FiLock className="w-4 h-4" />
                              </span>
                            )}
                            {canDeleteUser(user) ? (
                              deletingId === user.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(user.id)}
                                  className="px-2 py-1 rounded-lg text-xs text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  {t('users.actions.confirm')}
                                </button>
                                <button
                                  onClick={() => setDeletingId(null)}
                                  className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
                                >
                                  {t('users.actions.cancel')}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeletingId(user.id)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                title={t('users.actions.delete')}
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            )
                            ) : (
                              <span className="p-1.5 text-slate-300 dark:text-slate-600" title={t('users.actions.noPermission')}>
                                <FiLock className="w-4 h-4" />
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('users.pagination', { total: data?.total, page, totalPages })}
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

      {upgradeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <FiAlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {t('users.upgradeConfirm.title')}
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t('users.upgradeConfirm.message')}
            </p>
            <ul className="text-sm text-slate-500 dark:text-slate-400 mb-6 space-y-1.5 list-disc list-inside">
              <li>{t('users.upgradeConfirm.risk1')}</li>
              <li>{t('users.upgradeConfirm.risk2')}</li>
              <li>{t('users.upgradeConfirm.risk3')}</li>
            </ul>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setUpgradeConfirm(null)
                  setEditingId(null)
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                {t('users.upgradeConfirm.cancel')}
              </button>
              <button
                onClick={confirmUpgrade}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
              >
                {t('users.upgradeConfirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
