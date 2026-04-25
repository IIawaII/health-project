import { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import { TURNSTILE_SITE_KEY } from '@/lib/config';
import { 
  FiUser, 
  FiMail, 
  FiLock, 
  FiEye, 
  FiEyeOff, 
  FiLoader,
  FiShield,
  FiCheckCircle,
  FiXCircle,
  FiArrowRight,
  FiMessageSquare
} from 'react-icons/fi';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    verificationCode: '',
  });
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [countdown, setCountdown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const checkAbortRef = useRef<AbortController | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 密码强度验证
  const passwordChecks = {
    length: formData.password.length >= 8,
    hasNumber: /\d/.test(formData.password),
    hasLetter: /[a-zA-Z]/.test(formData.password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
  };

  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const checkAvailability = async (field: 'username' | 'email', value: string) => {
    if (!value) return;
    if (field === 'email' && !validateEmail(value)) return;
    if (field === 'username' && !/^[a-zA-Z0-9_]{3,10}$/.test(value)) return;

    const statusSetter = field === 'username' ? setUsernameStatus : setEmailStatus;
    const errorSetter = field === 'username' ? setUsernameError : setEmailError;

    statusSetter('checking');
    errorSetter('');

    // 取消之前的请求，避免竞态条件
    checkAbortRef.current?.abort();
    const controller = new AbortController();
    checkAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('/api/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json() as { available?: boolean; error?: string };

      if (!res.ok) {
        statusSetter('idle');
        errorSetter(data.error || '检查失败，请稍后重试');
        return;
      }

      if (data.available) {
        statusSetter('available');
        errorSetter('');
      } else {
        statusSetter('taken');
        errorSetter(field === 'username' ? '用户名已被注册' : '邮箱已被注册');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 如果是当前请求被主动取消，不重置状态（新请求会覆盖）
        if (controller.signal.reason !== 'next-check') {
          statusSetter('idle');
          errorSetter('检查超时，请检查网络或稍后重试');
        }
      } else {
        statusSetter('idle');
      }
    } finally {
      if (checkAbortRef.current === controller) {
        checkAbortRef.current = null;
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');

    if (name === 'email') {
      setEmailStatus('idle');
      if (value && !validateEmail(value)) {
        setEmailError('请输入有效的邮箱地址');
      } else {
        setEmailError('');
      }
    }

    if (name === 'username') {
      setUsernameStatus('idle');
      setUsernameError('');
    }
  };

  const handleEmailBlur = () => {
    if (formData.email) {
      if (!validateEmail(formData.email)) {
        setEmailError('请输入有效的邮箱地址');
      } else {
        checkAvailability('email', formData.email);
      }
    }
  };

  const handleUsernameBlur = () => {
    if (formData.username) {
      if (!/^[a-zA-Z0-9_]{3,10}$/.test(formData.username)) {
        setUsernameError('用户名只能包含字母、数字和下划线，长度3-10位');
      } else {
        checkAvailability('username', formData.username);
      }
    }
  };

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setError('');
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setError('人机验证失败，请刷新页面重试');
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
    setError('验证已过期，请重新验证');
  }, []);

  const handleSendCode = async () => {
    if (!validateEmail(formData.email)) {
      setEmailError('请输入有效的邮箱地址');
      return;
    }
    if (emailStatus === 'taken') {
      setError('该邮箱已被注册');
      return;
    }
    if (!turnstileToken) {
      setError('请先完成人机验证');
      return;
    }

    setIsSendingCode(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send_verification_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          type: 'register',
          turnstileToken,
        }),
      });
      const data = await res.json() as { success: boolean; message?: string; error?: string };

      if (data.success) {
        setCountdown(60);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(countdownRef.current!);
              countdownRef.current = null;
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(data.error || '发送失败');
        // 如果 Turnstile 验证失败，重置 token
        if (data.error?.includes('人机验证')) {
          setTurnstileToken('');
          setTurnstileKey((prev) => prev + 1);
        }
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setIsSendingCode(false);
    }
  };

  // 组件卸载时清理倒计时 interval，防止内存泄漏
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  const validateForm = (): boolean => {
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword || !formData.verificationCode) {
      setError('请填写所有必填字段');
      return false;
    }

      if (!/^[a-zA-Z0-9_]{3,10}$/.test(formData.username)) {
        setError('用户名只能包含字母、数字和下划线，长度3-10位');
        return false;
      }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('请输入有效的邮箱地址');
      return false;
    }

    if (formData.password.length < 8 || formData.password.length > 128) {
      setError('密码长度应在8-128位之间');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return false;
    }

    if (!/^\d{6}$/.test(formData.verificationCode)) {
      setError('请输入6位数字验证码');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    if (!turnstileToken) {
      setError('请完成人机验证');
      return;
    }

    setIsLoading(true);
    setError('');

    const result = await register({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      turnstileToken,
      verificationCode: formData.verificationCode,
    });

    setIsLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || '注册失败');
      // 重置 Turnstile token 并强制重新渲染验证组件
      setTurnstileToken('');
      setTurnstileKey(prev => prev + 1);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 flex items-start sm:items-center justify-center p-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md my-auto">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg mb-4">
            <FiShield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Health Project</h1>
          <p className="text-slate-500 mt-1">智能健康诊断平台</p>
        </div>

        {/* Register Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-6">创建账号</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-sm">
                <span className="flex-shrink-0">⚠️</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  用户名
                </label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={formData.username}
                    onChange={handleChange}
                    onBlur={handleUsernameBlur}
                    placeholder="3-10位字母、数字或下划线"
                    maxLength={10}
                    className={`w-full pl-10 pr-9 py-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none ${
                      usernameError ? 'border-red-300 focus:ring-red-200' : 'border-slate-200'
                    }`}
                    disabled={isLoading}
                  />
                  {usernameStatus === 'checking' && (
                    <FiLoader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                  )}
                  {usernameStatus === 'available' && (
                    <FiCheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                  )}
                  {usernameStatus === 'taken' && (
                    <FiXCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                  )}
                </div>
                {usernameError && (
                  <p className="mt-1 text-xs text-red-500">{usernameError}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  邮箱
                </label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleEmailBlur}
                    placeholder="your@email.com"
                    maxLength={254}
                    className={`w-full pl-10 pr-9 py-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none ${
                      emailError ? 'border-red-300 focus:ring-red-200' : 'border-slate-200'
                    }`}
                    disabled={isLoading}
                  />
                  {emailStatus === 'checking' && (
                    <FiLoader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                  )}
                  {emailStatus === 'available' && (
                    <FiCheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                  )}
                  {emailStatus === 'taken' && (
                    <FiXCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                  )}
                </div>
                {emailError && (
                  <p className="mt-1 text-xs text-red-500">{emailError}</p>
                )}
              </div>

              {/* Verification Code */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  验证码
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FiMessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      name="verificationCode"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      value={formData.verificationCode}
                      onChange={handleChange}
                      placeholder="请输入6位验证码"
                      maxLength={6}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || isSendingCode || !turnstileToken || emailStatus === 'taken' || !validateEmail(formData.email)}
                    className="px-4 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSendingCode ? (
                      <FiLoader className="w-4 h-4 animate-spin" />
                    ) : countdown > 0 ? (
                      `${countdown}s后重发`
                    ) : (
                      '获取验证码'
                    )}
                  </button>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  密码
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="至少8位字符"
                    maxLength={128}
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            passwordStrength >= level
                              ? passwordStrength <= 2
                                ? 'bg-red-400'
                                : passwordStrength === 3
                                ? 'bg-yellow-400'
                                : 'bg-green-400'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className={`flex items-center gap-1 ${passwordChecks.length ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.length ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        至少8位
                      </div>
                      <div className={`flex items-center gap-1 ${passwordChecks.hasNumber ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.hasNumber ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        包含数字
                      </div>
                      <div className={`flex items-center gap-1 ${passwordChecks.hasLetter ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.hasLetter ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        包含字母
                      </div>
                      <div className={`flex items-center gap-1 ${passwordChecks.hasSpecial ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.hasSpecial ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        特殊字符
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  确认密码
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="再次输入密码"
                    maxLength={128}
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showConfirmPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                  </button>
                </div>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">两次输入的密码不一致</p>
                )}
              </div>

              {/* Turnstile Verification */}
              <div className="pt-2">
                <TurnstileWidget
                  key={turnstileKey}
                  siteKey={TURNSTILE_SITE_KEY || ''}
                  onVerify={handleTurnstileVerify}
                  onError={handleTurnstileError}
                  onExpire={handleTurnstileExpire}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !turnstileToken || passwordStrength < 2}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-2.5 rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 focus:ring-4 focus:ring-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <FiLoader className="w-5 h-5 animate-spin" />
                    注册中...
                  </>
                ) : (
                  <>
                    注册
                    <FiArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-8 py-4 border-t border-slate-100">
            <p className="text-center text-sm text-slate-600">
              已有账号？{' '}
              <Link 
                to="/login" 
                className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                立即登录
              </Link>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <p className="text-center text-xs text-slate-400 mt-6">
          受 Cloudflare Turnstile 保护，确保您的账户安全
        </p>
      </div>
    </div>
  );
}
