import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { FiLoader } from 'react-icons/fi'

export function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <div className="flex flex-col items-center gap-3">
          <FiLoader className="w-8 h-8 text-primary-500 animate-spin" />
          <p className="text-sm text-foreground-subtle">加载中...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}
