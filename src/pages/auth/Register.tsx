import { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { TurnstileWidget } from '@/components/common/TurnstileWidget';
import { TURNSTILE_SITE_KEY } from '@/config/app';
import { useMaintenanceMode, useRegistrationEnabled } from '@/hooks/useClientConfig';
import { registerSchema } from '@shared/schemas';
import { fetchWithTimeout } from '@/api/client';
import { AVATAR_LIST } from '@/utils/avatar';
import Avatar from '@/components/common/Avatar';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
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
  FiCheck,
  FiMessageSquare,
  FiMoon,
  FiSun,
} from 'react-icons/fi';

export default function Register() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { register } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  
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
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeAvatar, setWelcomeAvatar] = useState('');
  const [welcomeNickname, setWelcomeNickname] = useState('');
  const [typedText, setTypedText] = useState('');
  const [typingDone, setTypingDone] = useState(false);
  const [isSavingWelcome, setIsSavingWelcome] = useState(false);
  const checkAbortRef = useRef<AbortController | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { value: isMaintenance } = useMaintenanceMode();
  const { value: isRegistrationEnabled } = useRegistrationEnabled();
  const isRegistrationClosed = !isRegistrationEnabled;

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

  const checkAvailability = useCallback(async (field: 'username' | 'email', value: string) => {
    if (!value) return;
    if (field === 'email' && !validateEmail(value)) return;
    if (field === 'username' && !/^[a-zA-Z0-9_]{3,10}$/.test(value)) return;

    const statusSetter = field === 'username' ? setUsernameStatus : setEmailStatus;
    const errorSetter = field === 'username' ? setUsernameError : setEmailError;

    statusSetter('checking');
    errorSetter('');

    checkAbortRef.current?.abort();
    const controller = new AbortController();
    checkAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetchWithTimeout('/api/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json() as { available?: boolean; error?: string };

      if (res.status === 429) {
        statusSetter('idle');
        return;
      }

      if (!res.ok) {
        statusSetter('idle');
        errorSetter(data.error || t('auth.register.errors.checkFailed'));
        return;
      }

      if (data.available) {
        statusSetter('available');
        errorSetter('');
      } else {
        statusSetter('taken');
        errorSetter(field === 'username' ? t('auth.register.usernameTaken') : t('auth.register.emailTaken'));
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (controller.signal.reason !== 'next-check') {
          statusSetter('idle');
          errorSetter(t('auth.register.errors.checkTimeout'));
        }
      } else {
        statusSetter('idle');
      }
    } finally {
      if (checkAbortRef.current === controller) {
        checkAbortRef.current = null;
      }
    }
  }, [t]);

  const debouncedCheck = useCallback((field: 'username' | 'email', value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      checkAvailability(field, value);
    }, 500);
  }, [checkAvailability]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');

    if (name === 'email') {
      setEmailStatus('idle');
      if (value && !validateEmail(value)) {
        setEmailError(t('auth.register.emailError'));
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
        setEmailError(t('auth.register.emailError'));
      } else {
        debouncedCheck('email', formData.email);
      }
    }
  };

  const handleUsernameBlur = () => {
    if (formData.username) {
      if (!/^[a-zA-Z0-9_]{3,10}$/.test(formData.username)) {
        setUsernameError(t('auth.register.usernameError'));
      } else {
        debouncedCheck('username', formData.username);
      }
    }
  };

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setError('');
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setError(t('auth.login.turnstileError'));
  }, [t]);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
    setError(t('auth.login.turnstileExpired'));
  }, [t]);

  const handleSendCode = async () => {
    if (!validateEmail(formData.email)) {
      setEmailError(t('auth.register.emailError'));
      return;
    }
    if (emailStatus === 'taken') {
      setError(t('auth.register.emailTaken'));
      return;
    }
    if (!turnstileToken) {
      setError(t('auth.login.turnstileError'));
      return;
    }

    setIsSendingCode(true);
    setError('');

    try {
      const res = await fetchWithTimeout('/api/auth/sendVerificationCode', {
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
        setError(data.error || t('auth.register.errors.sendCodeFailed'));
        // 如果 Turnstile 验证失败，重置 token
        if (data.error?.includes(t('auth.validation.turnstileRequired', '请完成人机验证'))) {
          setTurnstileToken('');
          setTurnstileKey((prev) => prev + 1);
        }
      }
    } catch {
      setError(t('common.networkError'));
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

  const WELCOME_TEXT = t('auth.welcomeText', '嗨，别来无恙啊👋');

  useEffect(() => {
    if (!showWelcome) {
      setTypedText('');
      setTypingDone(false);
      return;
    }
    setWelcomeNickname('');
    let i = 0;
    const timer = setInterval(() => {
      if (i < WELCOME_TEXT.length) {
        setTypedText(WELCOME_TEXT.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
        setTypingDone(true);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [showWelcome, WELCOME_TEXT]);

  const handleWelcomeConfirm = async () => {
    if (!welcomeAvatar) return;
    setIsSavingWelcome(true);
    try {
      const body: { avatar: string; accountname?: string } = { avatar: welcomeAvatar };
      if (welcomeNickname.trim()) {
        body.accountname = welcomeNickname.trim();
      }
      await fetchWithTimeout('/api/auth/update_profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      // 静默处理，不影响跳转
    }
    setIsSavingWelcome(false);
    navigate('/');
  };

  const validateForm = (): boolean => {
    const result = registerSchema.safeParse({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      turnstileToken: turnstileToken || '',
      verificationCode: formData.verificationCode,
    });
    if (!result.success) {
      setError(result.error.errors[0]?.message || t('auth.errors.invalidRequest'));
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.register.passwordMismatch'));
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 运维模式下跳转维护页面
    if (isMaintenance) {
      navigate('/maintenance', { replace: true });
      return;
    }

    // 注册关闭时跳转拒绝注册页面
    if (isRegistrationClosed) {
      navigate('/registration-closed', { replace: true });
      return;
    }

    if (!validateForm()) return;

    if (!turnstileToken) {
      setError(t('auth.register.errors.turnstileRequired'));
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
      setShowWelcome(true);
    } else {
      setError(result.error || t('auth.register.errors.registrationFailed'));
      // 重置 Turnstile token 并强制重新渲染验证组件
      setTurnstileToken('');
      setTurnstileKey(prev => prev + 1);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-start sm:items-center justify-center p-4 py-6 overflow-y-auto transition-colors relative">
      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={toggleTheme}
          title={resolvedTheme === 'dark' ? t('theme.light') : t('theme.dark')}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors"
        >
          {resolvedTheme === 'dark' ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
        </button>
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md my-auto">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg mb-4">
            <FiShield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Cloud Health</h1>
        </div>

        {/* Register Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
          <div className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-6">{t('auth.register.title')}</h2>

            {isMaintenance && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                <span className="flex-shrink-0">⚠️</span>
                {t('maintenance.desc')}
              </div>
            )}
            {isRegistrationClosed && !isMaintenance && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                <span className="flex-shrink-0">⚠️</span>
                {t('registrationClosed.desc')}
              </div>
            )}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                <span className="flex-shrink-0">⚠️</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.register.username')}
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
                    placeholder={t('auth.register.usernamePlaceholder')}
                    maxLength={10}
                    className={`w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      usernameError ? 'border-red-300 dark:border-red-600 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600'
                    }`}
                    disabled={isLoading}
                  />
                  {usernameStatus === 'checking' && (
                    <div className="absolute right-3 top-0 bottom-0 flex items-center">
                      <FiLoader className="w-4 h-4 text-slate-400 animate-spin origin-center" />
                    </div>
                  )}
                  {usernameStatus === 'available' && (
                    <div className="absolute right-3 top-0 bottom-0 flex items-center">
                      <FiCheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                  {usernameStatus === 'taken' && (
                    <div className="absolute right-3 top-0 bottom-0 flex items-center">
                      <FiXCircle className="w-4 h-4 text-red-500" />
                    </div>
                  )}
                </div>
                {usernameError && (
                  <p className="mt-1 text-xs text-red-500">{usernameError}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.register.email')}
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
                    placeholder={t('auth.register.emailPlaceholder')}
                    maxLength={254}
                    className={`w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      emailError ? 'border-red-300 dark:border-red-600 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600'
                    }`}
                    disabled={isLoading}
                  />
                  {emailStatus === 'checking' && (
                    <div className="absolute right-3 top-0 bottom-0 flex items-center">
                      <FiLoader className="w-4 h-4 text-slate-400 animate-spin origin-center" />
                    </div>
                  )}
                  {emailStatus === 'available' && (
                    <div className="absolute right-3 top-0 bottom-0 flex items-center">
                      <FiCheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                  {emailStatus === 'taken' && (
                    <div className="absolute right-3 top-0 bottom-0 flex items-center">
                      <FiXCircle className="w-4 h-4 text-red-500" />
                    </div>
                  )}
                </div>
                {emailError && (
                  <p className="mt-1 text-xs text-red-500">{emailError}</p>
                )}
              </div>

              {/* Verification Code */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.register.verificationCode')}
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
                      placeholder={t('auth.register.verificationCodePlaceholder')}
                      maxLength={6}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || isSendingCode || !turnstileToken || emailStatus === 'taken' || !validateEmail(formData.email)}
                    className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSendingCode ? (
                      <FiLoader className="w-4 h-4 animate-spin" />
                    ) : countdown > 0 ? (
                      t('auth.register.resendIn', { seconds: countdown })
                    ) : (
                      t('auth.register.sendCode')
                    )}
                  </button>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.register.password')}
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={t('auth.register.passwordPlaceholder')}
                    maxLength={30}
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
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
                              : 'bg-slate-200 dark:bg-slate-600'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className={`flex items-center gap-1 ${passwordChecks.length ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.length ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        {t('auth.register.passwordChecks.length')}
                      </div>
                      <div className={`flex items-center gap-1 ${passwordChecks.hasNumber ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.hasNumber ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        {t('auth.register.passwordChecks.number')}
                      </div>
                      <div className={`flex items-center gap-1 ${passwordChecks.hasLetter ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.hasLetter ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        {t('auth.register.passwordChecks.letter')}
                      </div>
                      <div className={`flex items-center gap-1 ${passwordChecks.hasSpecial ? 'text-green-600' : 'text-slate-400'}`}>
                        {passwordChecks.hasSpecial ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
                        {t('auth.register.passwordChecks.special')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.register.confirmPassword')}
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder={t('auth.register.confirmPasswordPlaceholder')}
                    maxLength={30}
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {showConfirmPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                  </button>
                </div>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">{t('auth.register.passwordMismatch')}</p>
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
                    {t('auth.register.registering')}
                  </>
                ) : (
                  <>
                    {t('auth.register.submit')}
                    <FiArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-700/50 px-8 py-4 border-t border-slate-100 dark:border-slate-700 transition-colors">
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              {t('auth.register.hasAccount')}{' '}
              <Link 
                to="/login" 
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                {t('auth.register.loginNow')}
              </Link>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          {t('auth.login.securityNotice')}
        </p>
      </div>

      {/* Welcome Modal */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-sm w-full overflow-hidden">
            <div className="p-8">
              <div className="text-center mb-6">
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 min-h-[2.5rem]">
                  {typedText}
                  {!typingDone && <span className="animate-pulse">|</span>}
                </p>
              </div>

              {typingDone && (
                <div className="space-y-5 animate-[fadeIn_0.4s_ease-out]">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {t('auth.register.welcomeAvatar')}
                    </label>
                    <div className="grid grid-cols-6 gap-1.5 max-h-[160px] overflow-y-auto p-2 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                      {AVATAR_LIST.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setWelcomeAvatar(name)}
                          className={`relative w-full aspect-square rounded-lg bg-white dark:bg-slate-600 flex items-center justify-center transition-all ${
                            welcomeAvatar === name
                              ? 'ring-2 ring-blue-500 scale-105'
                              : 'hover:scale-105 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <Avatar avatar={name} size={32} />
                          {welcomeAvatar === name && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-700">
                              <FiCheck className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {!welcomeAvatar && (
                      <p className="mt-1 text-xs text-amber-500">{t('auth.register.welcomeAvatarHint')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {t('auth.register.welcomeNickname')}
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={welcomeNickname}
                        onChange={(e) => setWelcomeNickname(e.target.value)}
                        placeholder={t('auth.register.welcomeNicknamePlaceholder')}
                        maxLength={20}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleWelcomeConfirm}
                    disabled={!welcomeAvatar || isSavingWelcome}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-2.5 rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 focus:ring-4 focus:ring-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingWelcome ? (
                      <FiLoader className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        {t('auth.register.welcomeGo')}
                        <FiArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
