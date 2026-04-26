import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiFileText,
  FiClipboard,
  FiMessageSquare,
  FiHelpCircle,
  FiArrowRight,
  FiActivity,
  FiShield,
  FiZap,
  FiHeart,
  FiLock,
  FiCheckCircle,
  FiMoon,
  FiSun,
} from 'react-icons/fi'
import { useTheme } from '@/hooks/useTheme'
import LanguageSwitcher from '@/components/common/LanguageSwitcher'
import LogoIcon from '@/components/common/LogoIcon'


export default function LandingPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { resolvedTheme, toggleTheme } = useTheme()

  const features = [
    {
      title: t('landing.features.report.title'),
      description: t('landing.features.report.description'),
      icon: FiFileText,
      color: 'from-blue-400 to-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: t('landing.features.plan.title'),
      description: t('landing.features.plan.description'),
      icon: FiClipboard,
      color: 'from-primary-400 to-primary-600',
      bgColor: 'bg-primary-50 dark:bg-primary-900/20',
    },
    {
      title: t('landing.features.chat.title'),
      description: t('landing.features.chat.description'),
      icon: FiMessageSquare,
      color: 'from-violet-400 to-violet-600',
      bgColor: 'bg-violet-50 dark:bg-violet-900/20',
    },
    {
      title: t('landing.features.quiz.title'),
      description: t('landing.features.quiz.description'),
      icon: FiHelpCircle,
      color: 'from-amber-400 to-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    },
  ]

  const highlights = [
    { icon: FiZap, title: t('landing.highlights.ai.title'), desc: t('landing.highlights.ai.desc') },
    { icon: FiLock, title: t('landing.highlights.privacy.title'), desc: t('landing.highlights.privacy.desc') },
    { icon: FiHeart, title: t('landing.highlights.professional.title'), desc: t('landing.highlights.professional.desc') },
  ]

  const advantages = t('landing.advantages', { returnObjects: true }) as string[]

  return (
    <div className="min-h-screen bg-background-secondary dark:bg-background-dark-secondary transition-colors">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-700 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <LogoIcon className="w-9 h-9" />
              <span className="text-xl font-semibold text-foreground dark:text-foreground-dark tracking-tight">
                Cloud Health
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                title={resolvedTheme === 'dark' ? t('theme.light') : t('theme.dark')}
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                {resolvedTheme === 'dark' ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
              </button>
              <LanguageSwitcher className="hidden sm:block" />
              <Link
                to="/login"
                className="px-4 py-2 rounded-lg text-sm font-medium text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
              >
                {t('nav.login')}
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-700 transition-all shadow-sm"
              >
                {t('nav.register')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 text-sm font-medium mb-6 animate-fade-in">
            <FiActivity className="w-4 h-4" />
            {t('landing.badge')}
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground dark:text-foreground-dark mb-6 tracking-tight animate-fade-in">
            {t('landing.heroTitle1')}
            <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
              {t('landing.heroTitle2')}
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-foreground-muted dark:text-foreground-dark-muted max-w-2xl mx-auto leading-relaxed mb-10 animate-fade-in">
            {t('landing.heroDesc')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
            <button
              onClick={() => navigate('/register')}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium text-base hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg hover:shadow-xl"
            >
              {t('landing.startFree')}
              <FiArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('features')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white dark:bg-slate-800 text-foreground dark:text-foreground-dark font-medium text-base border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all shadow-sm"
            >
              {t('landing.learnMore')}
            </button>
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {highlights.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-100 dark:border-slate-700 shadow-card dark:shadow-card-dark text-center hover:shadow-card-hover transition-all duration-300"
                >
                  <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">{item.title}</h3>
                  <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted">{item.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-foreground dark:text-foreground-dark mb-4">{t('landing.coreFeatures')}</h2>
            <p className="text-foreground-muted dark:text-foreground-dark-muted max-w-xl mx-auto">
              {t('landing.coreFeaturesDesc')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="group relative bg-background-secondary dark:bg-slate-700/50 rounded-2xl p-6 border border-gray-100 dark:border-slate-700 shadow-card dark:shadow-card-dark hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="flex items-start gap-5">
                    <div
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0 shadow-lg`}
                    >
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Advantages + CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-3xl p-8 sm:p-12 text-white shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-10">
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t('landing.ctaTitle')}</h2>
                <p className="text-primary-100 mb-8 leading-relaxed">
                  {t('landing.ctaDesc')}
                </p>
                <div className="space-y-3">
                  {advantages.map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <FiCheckCircle className="w-5 h-5 text-primary-200 flex-shrink-0" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={() => navigate('/register')}
                  className="px-10 py-3.5 rounded-xl bg-white text-primary-600 font-semibold text-base hover:bg-primary-50 transition-all shadow-lg"
                >
                  {t('nav.register')}
                </button>
                <p className="text-xs text-primary-200">
                  {t('auth.login.noAccount')}{' '}
                  <Link to="/login" className="underline hover:text-white transition-colors">
                    {t('auth.login.registerNow')}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety Notice */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-800 transition-colors">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center gap-6 bg-primary-50 dark:bg-slate-700/50 rounded-2xl p-8 border border-primary-100 dark:border-slate-600">
            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-700 shadow-card flex items-center justify-center flex-shrink-0">
              <FiShield className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">{t('landing.safetyTitle')}</h3>
              <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted leading-relaxed">
                {t('landing.safetyDesc')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 py-8 px-4 sm:px-6 lg:px-8 transition-colors">
        <div className="max-w-7xl mx-auto text-center text-sm text-foreground-subtle dark:text-foreground-dark-subtle">
          <p>{t('landing.footer')}</p>
        </div>
      </footer>
    </div>
  )
}
