import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isFutureDate } from '@/utils'
import { FiAlertCircle, FiChevronRight, FiChevronLeft } from 'react-icons/fi'
import type { PlanFormData } from '@/types'

interface PlanFormProps {
  onSubmit: (data: PlanFormData) => void
  loading: boolean
}

function usePlanFormI18n() {
  const { t } = useTranslation()
  const fieldLabels: Record<string, string> = {
    name: t('planForm.fields.name'),
    age: t('planForm.fields.age'),
    gender: t('planForm.fields.gender'),
    height: t('planForm.fields.height'),
    weight: t('planForm.fields.weight'),
    goal: t('planForm.fields.goal'),
    dietaryPreference: t('planForm.fields.dietaryPreference'),
    exerciseHabit: t('planForm.fields.exerciseHabit'),
    sleepQuality: t('planForm.fields.sleepQuality'),
    targetDate: t('planForm.fields.targetDate'),
    medicalConditions: t('planForm.fields.medicalConditions'),
    allergies: t('planForm.fields.allergies'),
  }
  const selectOptions: Record<string, string[]> = {
    gender: t('planForm.options.gender', { returnObjects: true }) as string[],
    goal: t('planForm.options.goal', { returnObjects: true }) as string[],
    dietaryPreference: t('planForm.options.dietaryPreference', { returnObjects: true }) as string[],
    exerciseHabit: t('planForm.options.exerciseHabit', { returnObjects: true }) as string[],
    sleepQuality: t('planForm.options.sleepQuality', { returnObjects: true }) as string[],
  }
  return { fieldLabels, selectOptions }
}

export default function PlanForm({ onSubmit, loading }: PlanFormProps) {
  const { t } = useTranslation()
  const { fieldLabels, selectOptions } = usePlanFormI18n()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<PlanFormData>({
    name: '',
    age: '',
    gender: '',
    height: '',
    weight: '',
    goal: '',
    dietaryPreference: '',
    exerciseHabit: '',
    sleepQuality: '',
    targetDate: '',
    medicalConditions: '',
    allergies: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const steps = [
    { title: t('planForm.steps.basic'), fields: ['name', 'age', 'gender', 'height', 'weight'] },
    { title: t('planForm.steps.goal'), fields: ['goal', 'targetDate'] },
    { title: t('planForm.steps.lifestyle'), fields: ['dietaryPreference', 'exerciseHabit', 'sleepQuality'] },
    { title: t('planForm.steps.other'), fields: ['medicalConditions', 'allergies'] },
  ]

  const updateField = (field: keyof PlanFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validateStep = () => {
    const currentFields = steps[step].fields
    const newErrors: Record<string, string> = {}

    for (const field of currentFields) {
      const value = form[field as keyof PlanFormData]
      if (!value || value.trim() === '') {
        newErrors[field] = t('planForm.errors.required', { label: fieldLabels[field] })
      }
    }

    if (form.age && (isNaN(Number(form.age)) || Number(form.age) < 1 || Number(form.age) > 120)) {
      newErrors.age = t('planForm.errors.ageInvalid')
    }
    if (form.height && (isNaN(Number(form.height)) || Number(form.height) < 50 || Number(form.height) > 250)) {
      newErrors.height = t('planForm.errors.heightInvalid')
    }
    if (form.weight && (isNaN(Number(form.weight)) || Number(form.weight) < 20 || Number(form.weight) > 300)) {
      newErrors.weight = t('planForm.errors.weightInvalid')
    }
    if (form.targetDate && !isFutureDate(form.targetDate)) {
      newErrors.targetDate = t('planForm.errors.targetDateInvalid')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep() && step < steps.length - 1) {
      setStep((s) => s + 1)
    }
  }

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleSubmit = () => {
    if (validateStep()) {
      onSubmit(form)
    }
  }

  const renderField = (field: string) => {
    const label = fieldLabels[field]
    const value = form[field as keyof PlanFormData]
    const error = errors[field]

    if (selectOptions[field]) {
      return (
        <div key={field}>
          <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-1.5">
            {label}
          </label>
          <select
            value={value}
            onChange={(e) => updateField(field as keyof PlanFormData, e.target.value)}
            className={`w-full px-4 py-2.5 rounded-xl border bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 transition-all appearance-none ${
              error
                ? 'border-danger focus:ring-danger/30 focus:border-danger'
                : 'border-gray-200 dark:border-slate-600 focus:ring-primary/30 focus:border-primary'
            }`}
          >
            <option value="">{t('planForm.placeholder')}</option>
            {selectOptions[field].map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {error && (
            <p className="mt-1 text-xs text-danger flex items-center gap-1">
              <FiAlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>
      )
    }

    if (field === 'targetDate') {
      return (
        <div key={field}>
          <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-1.5">
            {label}
          </label>
          <input
            type="date"
            value={value}
            onChange={(e) => updateField(field as keyof PlanFormData, e.target.value)}
            className={`w-full px-4 py-2.5 rounded-xl border bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 transition-all ${
              error
                ? 'border-danger focus:ring-danger/30 focus:border-danger'
                : 'border-gray-200 dark:border-slate-600 focus:ring-primary/30 focus:border-primary'
            }`}
          />
          {error && (
            <p className="mt-1 text-xs text-danger flex items-center gap-1">
              <FiAlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>
      )
    }

    const inputType = ['age', 'height', 'weight'].includes(field) ? 'number' : 'text'

    return (
      <div key={field}>
        <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-1.5">
          {label}
        </label>
        <input
          type={inputType}
          value={value}
          onChange={(e) => updateField(field as keyof PlanFormData, e.target.value)}
          placeholder={t('planForm.inputPlaceholder', { label })}
          className={`w-full px-4 py-2.5 rounded-xl border bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 transition-all ${
            error
              ? 'border-danger focus:ring-danger/30 focus:border-danger'
              : 'border-gray-200 dark:border-slate-600 focus:ring-primary/30 focus:border-primary'
          }`}
        />
        {error && (
          <p className="mt-1 text-xs text-danger flex items-center gap-1">
            <FiAlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-card dark:shadow-card-dark overflow-hidden transition-colors">
      {/* Progress */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center mb-4">
          {steps.map((s, idx) => (
            <div key={s.title} className="flex items-center flex-1 last:flex-initial">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all flex-shrink-0 ${
                  idx <= step
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-foreground-subtle dark:text-foreground-dark-subtle'
                }`}
              >
                {idx + 1}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`h-1 mx-2 rounded-full transition-all flex-1 ${
                    idx < step ? 'bg-primary' : 'bg-gray-100 dark:bg-slate-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-sm font-medium text-foreground dark:text-foreground-dark text-center">
          {steps[step].title}
        </p>
      </div>

      {/* Form Fields */}
      <div className="px-6 py-5 space-y-4">
        {steps[step].fields.map(renderField)}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-700/50">
        <button
          onClick={handlePrev}
          disabled={step === 0}
          className={`flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            step === 0
              ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
              : 'text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <FiChevronLeft className="w-4 h-4" />
          {t('planForm.prev')}
        </button>

        {step < steps.length - 1 ? (
          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary-700 active:scale-95 transition-all"
          >
            {t('planForm.next')}
            <FiChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all ${
              loading
                ? 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg active:scale-95'
            }`}
          >
            {loading ? t('planForm.submitting') : t('planForm.submit')}
          </button>
        )}
      </div>
    </div>
  )
}
