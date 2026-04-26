import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/hooks/useTheme'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'
import { FiXCircle, FiMoon, FiSun, FiArrowLeft, FiLogIn } from 'react-icons/fi'

export default function RegistrationClosedPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { resolvedTheme, toggleTheme } = useTheme()

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4 transition-colors relative">
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

      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-2xl mb-6">
          <FiXCircle className="w-10 h-10 text-red-500" />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-3">
          {t('registrationClosed.title')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
          {t('registrationClosed.desc')}
        </p>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 transition-colors">
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all"
            >
              <FiArrowLeft className="w-4 h-4" />
              {t('registrationClosed.goBack')}
            </button>

            <Link
              to="/login"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all"
            >
              <FiLogIn className="w-4 h-4" />
              {t('registrationClosed.toLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
