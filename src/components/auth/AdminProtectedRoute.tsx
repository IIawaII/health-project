import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { FiLoader } from 'react-icons/fi'

export function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <div className="flex flex-col items-center gap-3">
          <FiLoader className="w-8 h-8 text-primary-500 animate-spin" />
          <p className="text-sm text-foreground-subtle">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}