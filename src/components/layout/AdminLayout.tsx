import { useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import { getAvatarDisplayUrl } from '@/utils/avatar'
import {
  FiHome,
  FiUsers,
  FiDatabase,
  FiSettings,
  FiMenu,
  FiLogOut,
  FiShield,
  FiChevronsLeft,
  FiChevronsRight,
  FiMoon,
  FiSun,
} from 'react-icons/fi'
import LanguageSwitcher from '../common/LanguageSwitcher'
import LogoIcon from '../common/LogoIcon'

const navItems = [
  { path: '/admin', labelKey: 'admin.dashboard', icon: FiHome },
  { path: '/admin/users', labelKey: 'admin.users', icon: FiUsers },
  { path: '/admin/data', labelKey: 'admin.data', icon: FiDatabase },
  { path: '/admin/config', labelKey: 'admin.config', icon: FiSettings },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { resolvedTheme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const avatarDisplay = useMemo(() => {
    const avatar = user?.avatar || localStorage.getItem('user_avatar') || undefined
    return getAvatarDisplayUrl(avatar)
  }, [user?.avatar])

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
    window.location.reload()
  }

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-slate-900 text-white flex flex-col transition-all duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-16' : 'w-64'}`}
      >
        {/* Brand */}
        <div
          className={`h-16 flex items-center gap-3 border-b border-slate-800 ${
            collapsed ? 'justify-center px-2' : 'px-6'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center flex-shrink-0">
            <FiShield className="w-4 h-4 text-white" />
          </div>
          <span className={`overflow-hidden whitespace-nowrap text-lg font-semibold tracking-tight transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
            {t('admin.title')}
          </span>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-4 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            const label = t(item.labelKey)
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? label : undefined}
                className={`flex items-center rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                } ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:block px-3 pb-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? t('admin.collapseExpand') : t('admin.collapseCollapse')}
            className={`flex items-center rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 transition-colors ${
              collapsed ? 'justify-center w-full px-2 py-2' : 'gap-2 px-3 py-2 w-full'
            }`}
          >
            {collapsed ? <FiChevronsRight className="w-4 h-4" /> : <FiChevronsLeft className="w-4 h-4" />}
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
              {t('admin.collapse')}
            </span>
          </button>
        </div>

        {/* Bottom info */}
        <div className={`p-4 border-t border-slate-800 ${collapsed ? 'flex flex-col items-center' : ''}`}>
          <div className={`flex items-center gap-3 mb-3 ${collapsed ? 'justify-center' : ''}`}>
            <img
              src={avatarDisplay}
              alt="avatar"
              className="w-8 h-8 rounded-full bg-gray-100 object-cover"
            />
            <div className={`flex-1 min-w-0 overflow-hidden transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
              <p className="text-sm font-medium text-white truncate">{user?.username}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title={collapsed ? t('nav.logout') : undefined}
            className={`flex items-center rounded-lg text-sm text-red-400 hover:bg-slate-800 transition-colors ${
              collapsed ? 'justify-center w-full px-2 py-2' : 'gap-2 px-3 py-2 w-full'
            }`}
          >
            <FiLogOut className="w-4 h-4" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
              {t('nav.logout')}
            </span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-8 transition-colors">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FiMenu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <LogoIcon className="w-4 h-4" />
              <span>Cloud Health</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-slate-800 dark:text-slate-200 font-medium">{t('admin.title')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              title={resolvedTheme === 'dark' ? t('theme.light') : t('theme.dark')}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {resolvedTheme === 'dark' ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
            </button>
            <LanguageSwitcher />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto bg-slate-50 dark:bg-slate-900 transition-colors">
          {children}
        </main>
      </div>
    </div>
  )
}
