import i18n from '@/i18n'

export function formatDate(dateInput: string | number): string {
  if (!dateInput) return ''
  const date = typeof dateInput === 'number' ? new Date(dateInput * 1000) : new Date(dateInput)
  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US'
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function isFutureDate(dateInput: string | number): boolean {
  if (!dateInput) return false
  const inputDate = typeof dateInput === 'number' ? new Date(dateInput * 1000) : new Date(dateInput)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return inputDate >= today
}
