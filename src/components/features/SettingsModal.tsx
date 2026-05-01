import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import type { User } from '@/types/auth'
import { AVATAR_LIST } from '@/utils/avatar'
import Avatar from '../common/Avatar'
import { fetchWithTimeout } from '@/api/client'
import { usernameSchema, emailSchema, changePasswordSchema } from '../../../shared/schemas'
import { FiX, FiMail, FiLock, FiUser, FiCheck, FiAlertCircle, FiMessageSquare, FiSmile } from 'react-icons/fi'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation()
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')
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

  // 当模态框打开时，从最新的 user 同步数据到表单
  useEffect(() => {
    if (isOpen) {
      setUsername(user?.username || '')
      setAccountname(user?.accountname || '')
      setEmail(user?.email || '')
      setSelectedAvatar(user?.avatar)
    }
  }, [isOpen, user?.username, user?.accountname, user?.email, user?.avatar])

  // 当模态框关闭时清空敏感状态
  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setVerificationCode('')
      setMessage(null)
    }
  }, [isOpen])

  const isEmailChanged = email !== (user?.email || '')

  if (!isOpen) return null

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          type: 'update_email',
          currentEmail: user?.email,
        }),
      })
      const data = await response.json() as { success: boolean; message?: string; error?: string }

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
    // 用户名格式验证
    if (username) {
      const uResult = usernameSchema.safeParse(username)
      if (!uResult.success) {
        showMessage('error', uResult.error.errors[0]?.message || t('settings.errors.invalidUsername'))
        return
      }
    }

    // 邮箱格式验证
    if (email) {
      const eResult = emailSchema.safeParse(email)
      if (!eResult.success) {
        showMessage('error', eResult.error.errors[0]?.message || t('settings.errors.invalidEmail'))
        return
      }
    }

    // 如果修改了邮箱，需要验证码
    if (isEmailChanged && !verificationCode) {
      showMessage('error', t('settings.errors.needCode'))
      return
    }

    setLoading(true)
    try {
      const body: { username?: string; email: string; avatar?: string; accountname?: string; verificationCode?: string } = { email }
      if (username !== (user?.username || '')) {
        body.username = username
      }
      if (accountname !== (user?.accountname || '')) {
        body.accountname = accountname.trim()
      }
      if (selectedAvatar) {
        body.avatar = selectedAvatar
      }
      if (isEmailChanged) {
        body.verificationCode = verificationCode
      }

      const response = await fetchWithTimeout('/api/auth/update_profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await response.json() as { user?: unknown; error?: string }
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await response.json() as { error?: string; requireReLogin?: boolean }
      if (response.ok) {
        showMessage('success', t('settings.messages.passwordSuccess'))
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        // 如果后端要求重新登录，自动执行登出并跳转
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-foreground dark:text-foreground-dark">{t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === 'profile'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark'
            }`}
          >
            <FiUser className="w-4 h-4" />
            {t('settings.tabs.profile')}
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === 'password'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark'
            }`}
          >
            <FiLock className="w-4 h-4" />
            {t('settings.tabs.password')}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-6 mt-4 flex items-center gap-2 p-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}>
            {message.type === 'success' ? <FiCheck className="w-4 h-4" /> : <FiAlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-5">
          {activeTab === 'profile' ? (
            <>
              {/* Avatar Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-3">{t('settings.avatar')}</label>
                <div className="grid grid-cols-5 gap-2 max-h-[240px] overflow-y-auto p-3 -m-1">
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
                <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                  <FiSmile className="w-4 h-4 inline mr-1" />
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
                <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                  <FiUser className="w-4 h-4 inline mr-1" />
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
                <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                  <FiMail className="w-4 h-4 inline mr-1" />
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

              {/* Verification Code (only when email changed) */}
              {isEmailChanged && (
                <div>
                  <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">
                    <FiMessageSquare className="w-4 h-4 inline mr-1" />
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
            </>
          ) : (
            <>
              {/* Current Password */}
              <div>
                <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">{t('settings.currentPassword')}</label>
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
                <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">{t('settings.newPassword')}</label>
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
                <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-2">{t('settings.confirmPassword')}</label>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
