import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAI } from '@/hooks/useAI'
import QuizPanel from '@/components/features/QuizPanel'
import { FiLoader, FiPlay, FiAlertCircle } from 'react-icons/fi'
import type { QuizQuestion, QuizResult } from '@/types'

interface QuizGenerateResponse {
  questions: QuizQuestion[]
}

export default function HealthQuiz() {
  const { t } = useTranslation()
  const [category, setCategory] = useState(t('quiz.categories.general'))
  const [difficulty, setDifficulty] = useState(t('quiz.difficulties.medium'))
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [result, setResult] = useState<QuizResult | null>(null)

  const categories = [
    t('quiz.categories.general'),
    t('quiz.categories.nutrition'),
    t('quiz.categories.exercise'),
    t('quiz.categories.mental'),
    t('quiz.categories.disease'),
    t('quiz.categories.firstAid'),
  ]

  const difficulties = [
    t('quiz.difficulties.easy'),
    t('quiz.difficulties.medium'),
    t('quiz.difficulties.hard'),
  ]

  const {
    loading: generating,
    error: generateError,
    execute: generateExecute,
  } = useAI<QuizGenerateResponse>({
    endpoint: '/api/quiz',
    onSuccess: (data: QuizGenerateResponse) => {
      setQuestions(data.questions || [])
      setResult(null)
    },
  })

  const {
    loading: grading,
    error: gradeError,
    execute: gradeExecute,
  } = useAI<QuizResult>({
    endpoint: '/api/quiz',
    onSuccess: (data: QuizResult) => {
      setResult(data)
    },
  })

  const handleGenerate = useCallback(() => {
    setQuestions([])
    setResult(null)
    generateExecute({ mode: 'generate', category, difficulty })
  }, [category, difficulty, generateExecute])

  const handleSubmit = useCallback(
    (answers: number[]) => {
      gradeExecute({
        mode: 'grade',
        questions,
        userAnswers: answers,
      })
    },
    [questions, gradeExecute]
  )

  const handleRegenerate = useCallback(() => {
    setQuestions([])
    setResult(null)
  }, [])

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-card dark:shadow-card-dark p-5 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-1.5">
              {t('quiz.category')}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all appearance-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground dark:text-foreground-dark mb-1.5">
              {t('quiz.difficulty')}
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all appearance-none"
            >
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 ${
            generating
              ? 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg hover:shadow-xl active:scale-[0.98]'
          }`}
        >
          {generating ? (
            <>
              <FiLoader className="w-4 h-4 animate-spin" />
              {t('quiz.generating')}
            </>
          ) : (
            <>
              <FiPlay className="w-4 h-4" />
              {t('quiz.generate')}
            </>
          )}
        </button>

        {(generateError || gradeError) && (
          <div className="mt-4 flex items-center gap-2 p-4 rounded-xl bg-danger/10 text-danger text-sm">
            <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
            {generateError || gradeError}
          </div>
        )}
      </div>

      {/* Quiz Content */}
      {(questions.length > 0 || result) && (
        <QuizPanel
          questions={questions}
          onSubmit={handleSubmit}
          result={result}
          loading={grading}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  )
}
