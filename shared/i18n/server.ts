import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

type TranslationValue = string | string[] | { [key: string]: TranslationValue }
type TranslationMap = { [key: string]: TranslationValue }

const translations: Record<string, TranslationMap> = {
  'zh-CN': zhCN as unknown as TranslationMap,
  'zh': zhCN as unknown as TranslationMap,
  'en-US': enUS as unknown as TranslationMap,
  'en': enUS as unknown as TranslationMap,
}

const DEFAULT_LOCALE = 'zh-CN'

function detectLocale(acceptLanguage?: string | null, cookieLang?: string | null): string {
  if (cookieLang && translations[cookieLang]) {
    return cookieLang
  }

  if (acceptLanguage) {
    const languages = acceptLanguage.split(',').map((lang) => {
      const [code, qStr] = lang.trim().split(';q=')
      const q = qStr ? parseFloat(qStr) : 1
      return { code: code.trim(), q }
    })
    languages.sort((a, b) => b.q - a.q)

    for (const { code } of languages) {
      if (translations[code]) return code
      const baseCode = code.split('-')[0]
      const match = Object.keys(translations).find((k) => k.split('-')[0] === baseCode)
      if (match) return match
    }
  }

  return DEFAULT_LOCALE
}

function getNestedValue(obj: TranslationMap, path: string): TranslationValue | undefined {
  const keys = path.split('.')
  let current: TranslationValue = obj
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as TranslationMap)[key]
    if (current === undefined) return undefined
  }
  return current
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = params[key]
    return val !== undefined ? String(val) : `{{${key}}}`
  })
}

export function t(key: string, defaultValue?: string, params?: Record<string, string | number>, locale?: string): string {
  const resolvedLocale = locale || DEFAULT_LOCALE
  const translationMap = translations[resolvedLocale] || translations[DEFAULT_LOCALE]

  const value = getNestedValue(translationMap, key)
  if (typeof value === 'string') {
    return interpolate(value, params)
  }

  if (resolvedLocale !== DEFAULT_LOCALE) {
    const defaultMap = translations[DEFAULT_LOCALE]
    const defaultValueFromMap = getNestedValue(defaultMap, key)
    if (typeof defaultValueFromMap === 'string') {
      return interpolate(defaultValueFromMap, params)
    }
  }

  if (typeof defaultValue === 'string') {
    return interpolate(defaultValue, params)
  }
  return key
}

export function getLocaleFromRequest(request: Request): string {
  const acceptLanguage = request.headers.get('Accept-Language')
  const cookieHeader = request.headers.get('Cookie')
  let cookieLang: string | null = null

  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)i18n_language=([^;]*)/)
    if (match) {
      cookieLang = decodeURIComponent(match[1])
    }
  }

  return detectLocale(acceptLanguage, cookieLang)
}

export function getLanguageName(locale: string): string {
  switch (locale) {
    case 'zh-CN': case 'zh': return '中文'
    case 'en-US': case 'en': return 'English'
    default: return '中文'
  }
}

const serverI18n = { t, getLocaleFromRequest, getLanguageName }

export default serverI18n
