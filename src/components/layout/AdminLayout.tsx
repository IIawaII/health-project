import { useState } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import Avatar from '../common/Avatar'
import {
  FiHome,
  FiUsers,
  FiDatabase,
  FiSettings,
  FiMenu,
  FiLogOut,
  FiChevronsLeft,
  FiChevronsRight,
  FiMoon,
  FiSun,
  FiHardDrive,
} from 'react-icons/fi'
import { MdAdminPanelSettings } from "react-icons/md";
import LanguageSwitcher from '../common/LanguageSwitcher'
import LogoIcon from '../common/LogoIcon'

const navItems = [
  { path: '/admin', labelKey: 'admin.dashboard', icon: FiHome },
  { path: '/admin/users', labelKey: 'admin.users', icon: FiUsers },
  { path: '/admin/data', labelKey: 'admin.data', icon: FiDatabase },
  { path: '/admin/backups', labelKey: 'admin.backups', icon: FiHardDrive },
  { path: '/admin/config', labelKey: 'admin.config', icon: FiSettings },
]

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { resolvedTheme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-slate-900 dark:bg-slate-950 text-white flex flex-col transition-all duration-300 overflow-hidden lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64 h-screen lg:h-full ${collapsed ? 'lg:w-16' : ''}`}
      >
        <div
          className={`h-16 flex items-center gap-3 px-6 border-b border-slate-800 dark:border-slate-800 ${
            collapsed ? 'lg:gap-0 lg:justify-center lg:px-2' : ''
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center flex-shrink-0">
            <MdAdminPanelSettings className="w-4 h-4 text-white" />
          </div>
          <span className={`overflow-hidden whitespace-nowrap text-lg font-semibold tracking-tight transition-all duration-300 opacity-100 w-auto ${
            collapsed ? 'lg:opacity-0 lg:w-0' : ''
          }`}>
            {t('admin.title')}
          </span>
        </div>

        <nav className={`flex-1 min-h-0 overflow-y-auto py-4 space-y-1 px-3 ${collapsed ? 'lg:px-2' : ''}`}>
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
                className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-all px-3 py-2.5 ${
                  active
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-slate-900'
                } ${collapsed ? 'lg:gap-0 lg:justify-center lg:px-2' : ''}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 opacity-100 w-auto ${
                  collapsed ? 'lg:opacity-0 lg:w-0' : ''
                }`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>

        <div className={`hidden lg:block shrink-0 pb-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? t('admin.collapseExpand') : t('admin.collapseCollapse')}
            className={`flex items-center gap-2 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 dark:hover:bg-slate-900 transition-colors px-3 py-2 w-full ${
              collapsed ? 'lg:gap-0 lg:justify-center lg:px-2' : ''
            }`}
          >
            {collapsed ? <FiChevronsRight className="w-4 h-4" /> : <FiChevronsLeft className="w-4 h-4" />}
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 opacity-100 w-auto ${
              collapsed ? 'lg:opacity-0 lg:w-0' : ''
            }`}>
              {t('admin.collapse')}
            </span>
          </button>
        </div>

        <div className={`shrink-0 p-4 border-t border-slate-800 dark:border-slate-800 ${collapsed ? 'lg:flex lg:flex-col lg:items-center lg:p-2' : ''}`}>
          <div className={`flex items-center gap-3 mb-3 ${collapsed ? 'lg:gap-0 lg:justify-center' : ''}`}>
            <Avatar avatar={user?.avatar || localStorage.getItem('user_avatar') || undefined} size={32} className="bg-gray-100 object-cover" />
            <div className={`flex-1 min-w-0 overflow-hidden transition-all duration-300 opacity-100 w-auto ${
              collapsed ? 'lg:opacity-0 lg:w-0' : ''
            }`}>
              <p className="text-sm font-medium text-white truncate">{user?.accountname || user?.username}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title={collapsed ? t('nav.logout') : undefined}
            className={`flex items-center gap-2 rounded-lg text-sm text-red-400 hover:bg-slate-800 dark:hover:bg-slate-900 transition-colors px-3 py-2 w-full ${
              collapsed ? 'lg:gap-0 lg:justify-center lg:px-2' : ''
            }`}
          >
            <FiLogOut className="w-4 h-4" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 opacity-100 w-auto ${
              collapsed ? 'lg:opacity-0 lg:w-0' : ''
            }`}>
              {t('nav.logout')}
            </span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
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

        <main className="flex-1 p-4 lg:p-8 overflow-auto bg-slate-50 dark:bg-slate-900 transition-colors">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
