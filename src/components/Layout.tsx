import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import SettingsModal from './SettingsModal'
import ApiSettings from './ApiSettings'
import { hasStoredApiConfig } from '@/lib/aiConfig'
import { getUserAvatarUrl } from '@/lib/avatar'
import {
  FiHome,
  FiFileText,
  FiClipboard,
  FiMessageSquare,
  FiHelpCircle,
  FiSettings,
  FiMenu,
  FiX,
  FiActivity,
  FiLogOut,
  FiCpu,
} from 'react-icons/fi'

const navItems = [
  { path: '/', label: '首页', icon: FiHome },
  { path: '/report', label: '报告分析', icon: FiFileText },
  { path: '/plan', label: '计划生成', icon: FiClipboard },
  { path: '/chat', label: '智能对话', icon: FiMessageSquare },
  { path: '/quiz', label: '健康问答', icon: FiHelpCircle },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false)
  const [apiConfigured, setApiConfigured] = useState(hasStoredApiConfig())
  const userMenuRef = useRef<HTMLDivElement>(null)

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
    navigate('/login')
  }

  const getAvatarDisplay = () => {
    const avatar = user?.avatar || localStorage.getItem('user_avatar') || undefined
    return getUserAvatarUrl(avatar)
  }

  return (
    <div className="min-h-screen bg-background-secondary flex flex-col">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <FiActivity className="w-5 h-5 text-white" />
              </div>
              <Link to="/" className="text-xl font-semibold text-foreground tracking-tight">
                Health Project
              </Link>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-foreground-muted hover:text-foreground hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
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
                    ? 'text-green-600 bg-green-50 hover:bg-green-100'
                    : 'text-red-600 bg-red-50 hover:bg-red-100'
                }`}
                title="AI 配置"
              >
                <FiCpu className="w-4 h-4" />
                <span>AI 配置</span>
                <span
                  className={`w-2 h-2 rounded-full ${apiConfigured ? 'bg-green-500' : 'bg-red-500'}`}
                />
              </button>

              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-gray-100 transition-all"
                >
                  <img
                    src={getAvatarDisplay()}
                    alt="avatar"
                    className="w-8 h-8 rounded-full bg-gray-100"
                  />
                  <span className="hidden sm:inline max-w-[100px] truncate">
                    {user?.username}
                  </span>
                </button>

                {/* User Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-fade-in">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-foreground">{user?.username}</p>
                        <p className="text-xs text-foreground-subtle truncate">{user?.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          setSettingsOpen(true)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground-muted hover:bg-gray-50 transition-colors"
                      >
                        <FiSettings className="w-4 h-4" />
                        账号设置
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <FiLogOut className="w-4 h-4" />
                        退出登录
                      </button>
                    </div>
                )}
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-foreground-muted hover:bg-gray-100"
              >
                {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 animate-fade-in">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-foreground-muted hover:text-foreground hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                )
              })}
              <div className="border-t border-gray-100 my-2" />
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  handleLogout()
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
              >
                <FiLogOut className="w-5 h-5" />
                退出登录
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-foreground-subtle">
          <p>Health Project - 智能健康诊断平台 | 本工具仅供参考，不能替代专业医疗建议</p>
        </div>
      </footer>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ApiSettings
        isOpen={apiSettingsOpen}
        onClose={() => {
          setApiSettingsOpen(false)
          setApiConfigured(hasStoredApiConfig())
        }}
        onConfigChange={() => setApiConfigured(hasStoredApiConfig())}
      />
    </div>
  )
}
