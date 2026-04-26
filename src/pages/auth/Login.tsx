import { useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { TurnstileWidget } from '@/components/common/TurnstileWidget';
import { TURNSTILE_SITE_KEY, MAINTENANCE_MODE } from '@/config/app';
import { loginSchema } from '@shared/schemas';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import {
  FiUser,
  FiLock,
  FiEye,
  FiEyeOff,
  FiLoader,
  FiShield,
  FiArrowRight,
  FiMoon,
  FiSun,
} from 'react-icons/fi';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { login } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  
  // 获取登录后要跳转的路径（ProtectedRoute 保存的）
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/home';
  
  const [formData, setFormData] = useState({
    usernameOrEmail: '',
    password: '',
  });
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const isMaintenance = MAINTENANCE_MODE === 'true';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 运维模式下普通用户直接跳转维护页面
    if (isMaintenance) {
      navigate('/maintenance', { replace: true });
      return;
    }

    const parseResult = loginSchema.safeParse({
      usernameOrEmail: formData.usernameOrEmail,
      password: formData.password,
      turnstileToken,
    });
    if (!parseResult.success) {
      setError(parseResult.error.errors[0]?.message || '请求参数错误');
      return;
    }

    setIsLoading(true);
    setError('');

    const result = await login({
      usernameOrEmail: formData.usernameOrEmail,
      password: formData.password,
      turnstileToken,
    });

    setIsLoading(false);

    if (result.success) {
      if (result.user?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } else {
      setError(result.error || '登录失败');
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

        {/* Login Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
          <div className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-6">{t('auth.login.title')}</h2>

            {isMaintenance && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                <span className="flex-shrink-0">⚠️</span>
                {t('maintenance.desc')}
              </div>
            )}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                <span className="flex-shrink-0">⚠️</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username/Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.login.usernameOrEmail')}
                </label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    name="usernameOrEmail"
                    autoComplete="username"
                    value={formData.usernameOrEmail}
                    onChange={handleChange}
                    placeholder={t('auth.login.usernameOrEmailPlaceholder')}
                    maxLength={254}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.login.password')}
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={t('auth.login.passwordPlaceholder')}
                    maxLength={128}
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
                disabled={isLoading || !turnstileToken}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-2.5 rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 focus:ring-4 focus:ring-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <FiLoader className="w-5 h-5 animate-spin" />
                    {t('auth.login.loggingIn')}
                  </>
                ) : (
                  <>
                    {t('auth.login.submit')}
                    <FiArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-700/50 px-8 py-4 border-t border-slate-100 dark:border-slate-700 transition-colors">
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              {t('auth.login.noAccount')}{' '}
              <Link 
                to="/register" 
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                {t('auth.login.registerNow')}
              </Link>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          {t('auth.login.securityNotice')}
        </p>
      </div>
    </div>
  );
}
