import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiGlobe, FiCheck } from 'react-icons/fi'

const LANGUAGES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
]

interface LanguageSwitcherProps {
  className?: string
}

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const current = LANGUAGES.find((l) => i18n.language.startsWith(l.code)) || LANGUAGES[0]

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        title="Language"
      >
        <FiGlobe className="w-4 h-4" />
        <span>{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 py-1 z-50 animate-fade-in">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                i18n.changeLanguage(lang.code)
                setOpen(false)
              }}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                current.code === lang.code
                  ? 'text-primary bg-primary-50 dark:bg-primary-900/20'
                  : 'text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {lang.label}
              {current.code === lang.code && <FiCheck className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
