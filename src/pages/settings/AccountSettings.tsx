import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import type { User } from '@/types/auth'
import { AVATAR_LIST } from '@/utils/avatar'
import Avatar from '@/components/common/Avatar'
import { fetchWithTimeout } from '@/api/client'
import { usernameSchema, emailSchema, changePasswordSchema } from '../../../shared/schemas'
import { getStoredApiConfig, saveApiConfig, clearApiConfig } from '@/config/ai'
import {
  FiUser,
  FiLock,
  FiMail,
  FiMessageSquare,
  FiSmile,
  FiCheck,
  FiAlertCircle,
  FiArrowLeft,
  FiCpu,
  FiGlobe,
  FiKey,
  FiTrash2,
} from 'react-icons/fi'

type SettingsTab = 'profile' | 'password' | 'ai'

export default function AccountSettings() {
  const { t } = useTranslation()
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as SettingsTab) || 'profile'
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [username, setUsername] = useState(user?.username || '')
  const [accountname, setAccountname] = useState(user?.accountname || '')
  const [email, setEmail] = useState(user?.email || '')
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessage, setAiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [apiConfigured, setApiConfigured] = useState(false)

  useEffect(() => {
    setUsername(user?.username || '')
    setAccountname(user?.accountname || '')
    setEmail(user?.email || '')
    setSelectedAvatar(user?.avatar)
  }, [user?.username, user?.accountname, user?.email, user?.avatar])

  useEffect(() => {
    getStoredApiConfig().then((cfg) => {
      if (cfg) {
        setAiBaseUrl(cfg.baseUrl)
        setAiApiKey(cfg.apiKey)
        setAiModel(cfg.model)
        setApiConfigured(!!cfg.baseUrl && !!cfg.apiKey && !!cfg.model)
      } else {
        setApiConfigured(false)
      }
    }).catch(() => setApiConfigured(false))
  }, [])

  const isEmailChanged = email !== (user?.email || '')

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const showAiMessage = (type: 'success' | 'error', text: string) => {
    setAiMessage({ type, text })
    setTimeout(() => setAiMessage(null), 3000)
  }

  const handleSendCode = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      showMessage('error', t('settings.errors.invalidEmail'))
      return
    }

    setIsSendingCode(true)
    setMessage(null)

    try {
      const response = await fetchWithTimeout('/api/auth/sendVerificationCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'update_email', currentEmail: user?.email }),
      })
      const data = (await response.json()) as { success: boolean; message?: string; error?: string }

      if (data.success) {
        setCountdown(60)
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer)
              return 0
            }
            return prev - 1
          })
        }, 1000)
        showMessage('success', t('settings.messages.codeSent'))
      } else {
        showMessage('error', data.error || t('common.error'))
      }
    } catch {
      showMessage('error', t('settings.errors.network'))
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleUpdateProfile = async () => {
    if (username) {
      const uResult = usernameSchema.safeParse(username)
      if (!uResult.success) {
        showMessage('error', uResult.error.errors[0]?.message || t('settings.errors.invalidUsername'))
        return
      }
    }

    if (email) {
      const eResult = emailSchema.safeParse(email)
      if (!eResult.success) {
        showMessage('error', eResult.error.errors[0]?.message || t('settings.errors.invalidEmail'))
        return
      }
    }

    if (isEmailChanged && !verificationCode) {
      showMessage('error', t('settings.errors.needCode'))
      return
    }

    setLoading(true)
    try {
      const body: { username?: string; email: string; avatar?: string; accountname?: string; verificationCode?: string } = { email }
      if (username !== (user?.username || '')) body.username = username
      if (accountname !== (user?.accountname || '')) body.accountname = accountname.trim()
      if (selectedAvatar) body.avatar = selectedAvatar
      if (isEmailChanged) body.verificationCode = verificationCode

      const response = await fetchWithTimeout('/api/auth/update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as { user?: unknown; error?: string }
      if (response.ok) {
        updateUser(data.user as User)
        showMessage('success', t('settings.messages.updateSuccess'))
        setVerificationCode('')
      } else {
        showMessage('error', data.error || t('common.error'))
      }
    } catch {
      showMessage('error', t('settings.errors.network'))
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async () => {
    const parseResult = changePasswordSchema.safeParse({ currentPassword, newPassword })
    if (!parseResult.success) {
      showMessage('error', parseResult.error.errors[0]?.message || t('common.error'))
      return
    }
    if (newPassword !== confirmPassword) {
      showMessage('error', t('settings.errors.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      const response = await fetchWithTimeout('/api/auth/change_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = (await response.json()) as { error?: string; requireReLogin?: boolean }
      if (response.ok) {
        showMessage('success', t('settings.messages.passwordSuccess'))
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        if (data.requireReLogin) {
          setTimeout(async () => {
            await logout()
            navigate('/login', { replace: true })
          }, 1500)
        }
      } else {
        showMessage('error', data.error || t('common.error'))
      }
    } catch {
      showMessage('error', t('settings.errors.network'))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAiConfig = async () => {
    const trimmedUrl = aiBaseUrl.trim()
    const trimmedKey = aiApiKey.trim()
    const trimmedModel = aiModel.trim()

    if (!trimmedUrl || !trimmedKey || !trimmedModel) {
      showAiMessage('error', t('apiConfig.errors.incomplete'))
      return
    }

    try {
      const url = new URL(trimmedUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        showAiMessage('error', t('apiConfig.errors.invalidProtocol', '仅支持 http:// 或 https:// 协议'))
        return
      }
    } catch {
      showAiMessage('error', t('apiConfig.errors.invalidUrl', '请输入有效的 URL 地址'))
      return
    }

    setAiLoading(true)
    try {
      await saveApiConfig({ baseUrl: trimmedUrl, apiKey: trimmedKey, model: trimmedModel })
      showAiMessage('success', t('apiConfig.messages.saved'))
      setApiConfigured(true)
    } catch (err) {
      showAiMessage('error', err instanceof Error ? err.message : t('apiConfig.errors.saveFailed'))
    } finally {
      setAiLoading(false)
    }
  }

  const handleClearAiConfig = () => {
    clearApiConfig()
    setAiBaseUrl('')
    setAiApiKey('')
    setAiModel('')
    setApiConfigured(false)
    showAiMessage('success', t('apiConfig.messages.cleared'))
  }

  const tabs: { key: SettingsTab; label: string; icon: typeof FiUser }[] = [
    { key: 'profile', label: t('settings.tabs.profile'), icon: FiUser },
    { key: 'password', label: t('settings.tabs.password'), icon: FiLock },
    { key: 'ai', label: t('nav.aiConfig'), icon: FiCpu },
  ]

  const activeMessage = activeTab === 'ai' ? aiMessage : message

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground dark:text-foreground-dark">{t('settings.title')}</h1>
          <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted mt-1">
            {user?.email}
          </p>
        </div>
      </div>

      {/* Message */}
      {activeMessage && (
        <div
          className={`flex items-center gap-2 p-4 rounded-xl text-sm font-medium ${
            activeMessage.type === 'success'
              ? 'bg-success/10 text-success border border-success/20'
              : 'bg-danger/10 text-danger border border-danger/20'
          }`}
        >
          {activeMessage.type === 'success' ? <FiCheck className="w-4 h-4 flex-shrink-0" /> : <FiAlertCircle className="w-4 h-4 flex-shrink-0" />}
          {activeMessage.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="md:w-56 flex-shrink-0">
          <nav className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-2 shadow-card dark:shadow-card-dark transition-colors">
            {/* User Info Card */}
            <div className="flex items-center gap-3 px-3 py-4 mb-2 border-b border-gray-100 dark:border-slate-700">
              <Avatar
                avatar={user?.avatar || localStorage.getItem('user_avatar') || undefined}
                size={44}
                className="bg-gray-100 dark:bg-slate-700 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground dark:text-foreground-dark truncate">
                  {user?.accountname || user?.username}
                </p>
                <p className="text-xs text-foreground-subtle dark:text-foreground-dark-subtle truncate">
                  {user?.username}
                </p>
              </div>
            </div>
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary'
                      : 'text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-foreground-dark'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 shadow-card dark:shadow-card-dark transition-colors">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Avatar */}
                <div>
                  <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-3">
                    {t('settings.avatar')}
                  </label>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-[280px] overflow-y-auto p-2 -m-1">
                    {AVATAR_LIST.map((name) => (
                      <button
                        key={name}
                        onClick={() => setSelectedAvatar(name)}
                        className={`relative w-full aspect-square rounded-xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center transition-all m-0.5 ${
                          selectedAvatar === name
                            ? 'ring-2 ring-primary scale-105'
                            : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <Avatar avatar={name} size={40} />
                        {selectedAvatar === name && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-800">
                            <FiCheck className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accountname */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    <FiSmile className="w-4 h-4 text-primary" />
                    {t('settings.accountname')}
                  </label>
                  <input
                    type="text"
                    value={accountname}
                    onChange={(e) => setAccountname(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder={t('settings.accountnamePlaceholder')}
                    maxLength={20}
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    <FiUser className="w-4 h-4 text-primary" />
                    {t('settings.username')}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder={t('auth.register.usernamePlaceholder')}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    <FiMail className="w-4 h-4 text-primary" />
                    {t('settings.email')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setVerificationCode('')
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder={t('auth.register.emailPlaceholder')}
                  />
                </div>

                {/* Verification Code */}
                {isEmailChanged && (
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                      <FiMessageSquare className="w-4 h-4 text-primary" />
                      {t('settings.verificationCode')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder={t('auth.register.verificationCodePlaceholder')}
                        maxLength={6}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      />
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={countdown > 0 || isSendingCode || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
                        className="px-4 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-medium hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isSendingCode ? (
                          <span className="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        ) : countdown > 0 ? (
                          t('settings.resendIn', { seconds: countdown })
                        ) : (
                          t('settings.sendCode')
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleUpdateProfile}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('settings.saving') : t('settings.save')}
                </button>
              </div>
            )}

            {activeTab === 'password' && (
              <div className="space-y-6">
                {/* Current Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    {t('settings.currentPassword')}
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    maxLength={30}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder={t('auth.login.passwordPlaceholder')}
                  />
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    {t('settings.newPassword')}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    maxLength={30}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder={t('auth.register.passwordPlaceholder')}
                  />
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    {t('settings.confirmPassword')}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    maxLength={30}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder={t('auth.register.confirmPasswordPlaceholder')}
                  />
                </div>

                <button
                  onClick={handleChangePassword}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('settings.changing') : t('settings.changePassword')}
                </button>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-6">
                {/* Status Banner */}
                <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                  apiConfigured
                    ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30'
                    : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                }`}>
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${apiConfigured ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className={`text-sm font-medium ${apiConfigured ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {apiConfigured ? t('apiConfig.statusConfigured') : t('apiConfig.statusNotConfigured')}
                  </span>
                </div>

                {/* Info Box */}
                <div className="text-xs text-foreground-muted dark:text-foreground-dark-muted bg-background-secondary dark:bg-slate-700/50 p-3.5 rounded-xl leading-relaxed border border-gray-100 dark:border-slate-700 transition-colors">
                  <p className="flex items-start gap-2">
                    <span className="inline-block w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    {t('apiConfig.info1')}
                  </p>
                  <p className="flex items-start gap-2 mt-1">
                    <span className="inline-block w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    {t('apiConfig.info2')}
                  </p>
                </div>

                {/* Base URL */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    <span className="w-6 h-6 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary flex items-center justify-center">
                      <FiGlobe className="w-3.5 h-3.5" />
                    </span>
                    {t('apiConfig.baseUrl')}
                  </label>
                  <input
                    type="text"
                    value={aiBaseUrl}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark placeholder:text-foreground-subtle dark:placeholder:text-foreground-dark-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                {/* API Key */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    <span className="w-6 h-6 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary flex items-center justify-center">
                      <FiKey className="w-3.5 h-3.5" />
                    </span>
                    {t('apiConfig.apiKey')}
                  </label>
                  <input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark placeholder:text-foreground-subtle dark:placeholder:text-foreground-dark-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder="sk-..."
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    <span className="w-6 h-6 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary flex items-center justify-center">
                      <FiCpu className="w-3.5 h-3.5" />
                    </span>
                    {t('apiConfig.model')}
                  </label>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark placeholder:text-foreground-subtle dark:placeholder:text-foreground-dark-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder="gpt-..."
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleSaveAiConfig}
                    disabled={aiLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('apiConfig.save')}
                  </button>
                  <button
                    onClick={handleClearAiConfig}
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 active:scale-[0.97] transition-all border border-red-100 dark:bg-red-900/20 dark:border-red-900/30 dark:hover:bg-red-900/30"
                  >
                    <FiTrash2 className="w-4 h-4" />
                    {t('apiConfig.clear')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
