import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next'
import { FiLoader } from 'react-icons/fi';
import { useMaintenanceMode } from '@/hooks/useClientConfig';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const { value: isMaintenance, initialized } = useMaintenanceMode();

  if (isLoading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <div className="flex flex-col items-center gap-3">
          <FiLoader className="w-8 h-8 text-primary-500 animate-spin" />
          <p className="text-sm text-foreground-subtle">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  if (isMaintenance) {
    return <Navigate to="/maintenance" replace />;
  }

  return <>{children}</>;
}
