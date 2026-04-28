import { Link } from 'react-router-dom'
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
} from 'react-icons/fi'
import { WELCOME_MESSAGE } from '@/config/app'

export default function Home() {
  const { t } = useTranslation()

  const features = [
    {
      path: '/report',
      title: t('home.features.report.title'),
      description: t('home.features.report.desc'),
      icon: FiFileText,
      color: 'from-blue-400 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      path: '/plan',
      title: t('home.features.plan.title'),
      description: t('home.features.plan.desc'),
      icon: FiClipboard,
      color: 'from-primary-400 to-primary-600',
      bgColor: 'bg-primary-50',
      textColor: 'text-primary-600',
    },
    {
      path: '/chat',
      title: t('home.features.chat.title'),
      description: t('home.features.chat.desc'),
      icon: FiMessageSquare,
      color: 'from-violet-400 to-violet-600',
      bgColor: 'bg-violet-50',
      textColor: 'text-violet-600',
    },
    {
      path: '/quiz',
      title: t('home.features.quiz.title'),
      description: t('home.features.quiz.desc'),
      icon: FiHelpCircle,
      color: 'from-amber-400 to-amber-600',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600',
    },
  ]

  const highlights = [
    { icon: FiZap, title: t('home.highlights.ai.title'), desc: t('home.highlights.ai.desc') },
    { icon: FiShield, title: t('home.highlights.privacy.title'), desc: t('home.highlights.privacy.desc') },
    { icon: FiHeart, title: t('home.highlights.professional.title'), desc: t('home.highlights.professional.desc') },
  ]

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center pt-8 pb-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-600 text-sm font-medium mb-6">
          <FiActivity className="w-4 h-4" />
          {t('home.title')}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground dark:text-foreground-dark mb-5 tracking-tight">
          {t('home.heroTitle1')}
          <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
            {t('home.heroTitle2')}
          </span>
        </h1>
        {WELCOME_MESSAGE && (
          <p className="text-lg text-primary-600 dark:text-primary-400 font-medium max-w-2xl mx-auto mb-3">
            {WELCOME_MESSAGE}
          </p>
        )}
        <p className="text-lg text-foreground-muted dark:text-foreground-dark-muted max-w-2xl mx-auto leading-relaxed">
          {t('home.description')}
        </p>

        <div className="flex items-center justify-center gap-8 mt-10">
          {highlights.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 shadow-card flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{item.title}</span>
                <span className="text-xs text-foreground-subtle">{item.desc}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Feature Cards */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Link
                key={feature.path}
                to={feature.path}
                className="group relative bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-100 shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start gap-5">
                  <div
                    className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0 shadow-lg`}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                        {feature.title}
                      </h3>
                      <FiArrowRight className="w-5 h-5 text-foreground-subtle group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-sm text-foreground-muted leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Tips */}
      <section className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl p-8 border border-primary-100 dark:border-slate-600">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-700 shadow-card flex items-center justify-center flex-shrink-0">
            <FiShield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground dark:text-foreground-dark mb-2">{t('home.safety.title')}</h3>
            <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted leading-relaxed">
              {t('home.safety.desc')}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
