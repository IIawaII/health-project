import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { FiLoader } from 'react-icons/fi';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // 显示加载状态，避免受保护内容一闪而过导致组件快速 mount/unmount
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <div className="flex flex-col items-center gap-3">
          <FiLoader className="w-8 h-8 text-primary-500 animate-spin" />
          <p className="text-sm text-foreground-subtle">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // 保存当前路径，登录后跳转回来
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 管理员不允许访问前台页面，强制重定向到后台
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
