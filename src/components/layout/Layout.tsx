import { useState, useRef, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import SettingsModal from '../features/SettingsModal'
import ApiSettings from '../features/ApiSettings'
import { hasStoredApiConfig } from '@/config/ai'
import { getAvatarDisplayUrl } from '@/utils/avatar'
import {
  FiHome,
  FiFileText,
  FiClipboard,
  FiMessageSquare,
  FiHelpCircle,
  FiSettings,
  FiMenu,
  FiX,
  FiLogOut,
  FiCpu,
  FiMoon,
  FiSun,
} from 'react-icons/fi'
import { useTheme } from '@/hooks/useTheme'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../common/LanguageSwitcher'
import LogoIcon from '../common/LogoIcon'

const navItems = [
  { path: '/home', labelKey: 'nav.home', icon: FiHome },
  { path: '/report', labelKey: 'nav.report', icon: FiFileText },
  { path: '/plan', labelKey: 'nav.plan', icon: FiClipboard },
  { path: '/chat', labelKey: 'nav.chat', icon: FiMessageSquare },
  { path: '/quiz', labelKey: 'nav.quiz', icon: FiHelpCircle },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { resolvedTheme, toggleTheme } = useTheme()
  const { t } = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false)
  const [apiConfigured, setApiConfigured] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // 异步检查 API 配置状态
  useEffect(() => {
    hasStoredApiConfig().then(setApiConfigured).catch(() => setApiConfigured(false))
  }, [])

  // 监听 storage 事件，同步多标签页的 AI 配置状态变化
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'health_ai_config_enc' || e.key === 'health_ai_config') {
        hasStoredApiConfig().then(setApiConfigured).catch(() => setApiConfigured(false))
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userMenuOpen])

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
    window.location.reload()
  }

  const avatarDisplay = useMemo(() => {
    const avatar = user?.avatar || localStorage.getItem('user_avatar') || undefined
    return getAvatarDisplayUrl(avatar)
  }, [user?.avatar])

  return (
    <div className="min-h-screen bg-background-secondary flex flex-col">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-700 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <LogoIcon className="w-9 h-9" />
              <Link to="/home" className="text-xl font-semibold text-foreground dark:text-foreground-dark tracking-tight">
                Cloud Health
              </Link>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                const label = t(item.labelKey)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                        : 'text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                )
              })}
            </nav>

            <div className="flex items-center gap-3">
              {/* AI Config Button */}
              <button
                onClick={() => setApiSettingsOpen(true)}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  apiConfigured
                    ? 'text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30'
                    : 'text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30'
                }`}
                title={t('nav.aiConfig')}
              >
                <FiCpu className="w-4 h-4" />
                <span>{t('nav.aiConfig')}</span>
                <span
                  className={`w-2 h-2 rounded-full ${apiConfigured ? 'bg-green-500' : 'bg-red-500'}`}
                />
              </button>

              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
                >
                  <img
                    src={avatarDisplay}
                    alt="avatar"
                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.onerror = null;
                      target.src = '/User/default.svg';
                    }}
                  />
                  <span className="hidden sm:inline max-w-[100px] truncate">
                    {user?.username}
                  </span>
                </button>

                {/* User Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 py-1 z-50 animate-fade-in">
                      <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
                        <p className="text-sm font-medium text-foreground dark:text-foreground-dark">{user?.username}</p>
                        <p className="text-xs text-foreground-subtle dark:text-foreground-dark-subtle truncate">{user?.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          setSettingsOpen(true)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <FiSettings className="w-4 h-4" />
                        {t('nav.settings')}
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <FiLogOut className="w-4 h-4" />
                        {t('nav.logout')}
                      </button>
                    </div>
                )}
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                title={resolvedTheme === 'dark' ? t('theme.light') : t('theme.dark')}
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg text-foreground-muted hover:text-foreground hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                {resolvedTheme === 'dark' ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
              </button>

              {/* Language Switcher */}
              <LanguageSwitcher className="hidden sm:block" />

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-foreground-muted hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 animate-fade-in transition-colors">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                const label = t(item.labelKey)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                        : 'text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </Link>
                )
              })}
              <div className="border-t border-gray-100 dark:border-slate-700 my-2" />
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  handleLogout()
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
              >
                <FiLogOut className="w-5 h-5" />
                {t('nav.logout')}
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-16 bg-background-secondary dark:bg-background-dark-secondary transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 py-6 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-foreground-subtle dark:text-foreground-dark-subtle">
          <p>{t('landing.footer')}</p>
        </div>
      </footer>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ApiSettings
        isOpen={apiSettingsOpen}
        onClose={() => {
          setApiSettingsOpen(false)
          hasStoredApiConfig().then(setApiConfigured).catch(() => setApiConfigured(false))
        }}
        onConfigChange={() => hasStoredApiConfig().then(setApiConfigured).catch(() => setApiConfigured(false))}
      />
    </div>
  )
}
