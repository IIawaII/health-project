import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ResultProvider } from '@/contexts/ResultContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AdminProtectedRoute } from '@/components/auth/AdminProtectedRoute'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import Layout from '@/components/layout/Layout'
import AdminLayout from '@/components/layout/AdminLayout'
import '@/i18n'

const Home = lazy(() => import('@/pages/home/Home'))
const LandingPage = lazy(() => import('@/pages/landing/LandingPage'))
const ReportAnalysis = lazy(() => import('@/pages/report/ReportAnalysis'))
const PlanGenerator = lazy(() => import('@/pages/plan/PlanGenerator'))
const SmartChat = lazy(() => import('@/pages/chat/SmartChat'))
const HealthQuiz = lazy(() => import('@/pages/quiz/HealthQuiz'))
const Login = lazy(() => import('@/pages/auth/Login'))
const Register = lazy(() => import('@/pages/auth/Register'))
const MaintenancePage = lazy(() => import('@/pages/maintenance/MaintenancePage'))
const RegistrationClosedPage = lazy(() => import('@/pages/auth/RegistrationClosedPage'))
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AdminUsers = lazy(() => import('@/pages/admin/Users'))
const AdminDataManagement = lazy(() => import('@/pages/admin/DataManagement'))
const AdminSystemConfig = lazy(() => import('@/pages/admin/SystemConfig'))

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-secondary">
      <div className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
    </div>
  )
}

// 统一认证状态检查与重定向
function AuthGuard({ fallback }: { fallback: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isAuthenticated) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/home'} replace />
  }

  return <>{fallback}</>
}

// 已登录用户访问登录/注册页面的重定向组件
function PublicRoute({ children }: { children: React.ReactNode }) {
  return <AuthGuard fallback={children} />
}

// 根路由：已登录用户重定向到 /home 或 /admin，未登录用户显示落地页
function LandingRoute() {
  return <AuthGuard fallback={<LandingPage />} />
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
    <Routes>
      {/* 根路由 - 落地页（未登录）或重定向到 /home（已登录） */}
      <Route path="/" element={<LandingRoute />} />

      {/* 公开路由 - 登录/注册 */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      {/* 受保护路由 - 需要登录 */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Layout>
              <Home />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/report"
        element={
          <ProtectedRoute>
            <Layout>
              <ReportAnalysis />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/plan"
        element={
          <ProtectedRoute>
            <Layout>
              <PlanGenerator />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <Layout>
              <SmartChat />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quiz"
        element={
          <ProtectedRoute>
            <Layout>
              <HealthQuiz />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* 管理员路由 */}
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminUsers />
            </AdminLayout>
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/data"
        element={
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminDataManagement />
            </AdminLayout>
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/config"
        element={
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminSystemConfig />
            </AdminLayout>
          </AdminProtectedRoute>
        }
      />

      {/* 状态页面 */}
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/registration-closed" element={<RegistrationClosedPage />} />

      {/* 默认重定向 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ResultProvider>
            <AppRoutes />
          </ResultProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
