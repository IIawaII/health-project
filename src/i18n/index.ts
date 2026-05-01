import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import zhCN from '@shared/i18n/locales/zh-CN.json'
import enUS from '@shared/i18n/locales/en-US.json'

const resources = {
  'zh-CN': { translation: zhCN },
  'zh': { translation: zhCN },
  'en-US': { translation: enUS },
  'en': { translation: enUS },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18n_language',
    },
  })

export default i18n
