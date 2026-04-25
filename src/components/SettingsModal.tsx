import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import type { User } from '@/types/auth'
import { AVATAR_LIST, getUserAvatarUrl } from '@/lib/avatar'
import { FiX, FiMail, FiLock, FiUser, FiCheck, FiAlertCircle, FiMessageSquare } from 'react-icons/fi'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, updateUser, token } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')
  const [username, setUsername] = useState(user?.username || '')
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
      setEmail(user?.email || '')
      setSelectedAvatar(user?.avatar)
    }
  }, [isOpen, user?.username, user?.email, user?.avatar])

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
      showMessage('error', '请输入有效的邮箱地址')
      return
    }

    setIsSendingCode(true)
    setMessage(null)

    try {
      const response = await fetch('/api/auth/send_verification_code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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
        showMessage('success', '验证码已发送')
      } else {
        showMessage('error', data.error || '发送失败')
      }
    } catch {
      showMessage('error', '网络错误，请稍后重试')
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleUpdateProfile = async () => {
    if (!token) return

    // 用户名格式验证
    if (username && !/^[a-zA-Z0-9_]{3,10}$/.test(username)) {
      showMessage('error', '用户名只能包含字母、数字和下划线，长度3-10位')
      return
    }

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (email && !emailRegex.test(email)) {
      showMessage('error', '请输入有效的邮箱地址')
      return
    }

    // 如果修改了邮箱，需要验证码
    if (isEmailChanged && !verificationCode) {
      showMessage('error', '请输入验证码')
      return
    }

    setLoading(true)
    try {
      const body: { username?: string; email: string; avatar?: string; verificationCode?: string } = { email }
      if (username !== (user?.username || '')) {
        body.username = username
      }
      if (selectedAvatar) {
        body.avatar = selectedAvatar
      }
      if (isEmailChanged) {
        body.verificationCode = verificationCode
      }

      const response = await fetch('/api/auth/update_profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await response.json() as { user?: unknown; error?: string }
      if (response.ok) {
        updateUser(data.user as User)
        showMessage('success', '个人信息更新成功')
        setVerificationCode('')
      } else {
        showMessage('error', data.error || '更新失败')
      }
    } catch {
      showMessage('error', '网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!token) return
    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('error', '请填写所有密码字段')
      return
    }
    if (newPassword.length < 6) {
      showMessage('error', '新密码至少6位')
      return
    }
    if (newPassword !== confirmPassword) {
      showMessage('error', '两次输入的新密码不一致')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/auth/change_password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await response.json() as { error?: string }
      if (response.ok) {
        showMessage('success', '密码修改成功')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        showMessage('error', data.error || '修改失败')
      }
    } catch {
      showMessage('error', '网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-foreground">账号设置</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-muted hover:bg-gray-100 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === 'profile'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-muted hover:text-foreground'
            }`}
          >
            <FiUser className="w-4 h-4" />
            个人资料
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === 'password'
                ? 'text-primary border-b-2 border-primary'
                : 'text-foreground-muted hover:text-foreground'
            }`}
          >
            <FiLock className="w-4 h-4" />
            修改密码
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
                <label className="block text-sm font-medium text-foreground mb-3">选择头像</label>
                <div className="grid grid-cols-5 gap-2 max-h-[240px] overflow-y-auto p-3 -m-1">
                  {AVATAR_LIST.map((name) => (
                    <button
                      key={name}
                      onClick={() => setSelectedAvatar(name)}
                      className={`relative w-full aspect-square rounded-xl bg-gray-50 flex items-center justify-center transition-all m-0.5 ${
                        selectedAvatar === name
                          ? 'ring-2 ring-primary scale-105'
                          : 'hover:scale-105 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={getUserAvatarUrl(name)}
                        alt={name}
                        className="w-10 h-10"
                        loading="lazy"
                      />
                      {selectedAvatar === name && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm border-2 border-white">
                          <FiCheck className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <FiUser className="w-4 h-4 inline mr-1" />
                  用户名
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="3-10位字母、数字或下划线"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <FiMail className="w-4 h-4 inline mr-1" />
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setVerificationCode('')
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="请输入邮箱"
                />
              </div>

              {/* Verification Code (only when email changed) */}
              {isEmailChanged && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <FiMessageSquare className="w-4 h-4 inline mr-1" />
                    验证码
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="请输入6位验证码"
                      maxLength={6}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
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
                        `${countdown}s后重发`
                      ) : (
                        '获取验证码'
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
                {loading ? '保存中...' : '保存修改'}
              </button>
            </>
          ) : (
            <>
              {/* Current Password */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">当前密码</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="请输入当前密码"
                />
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="至少6位"
                />
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="再次输入新密码"
                />
              </div>

              <button
                onClick={handleChangePassword}
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '修改中...' : '修改密码'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
