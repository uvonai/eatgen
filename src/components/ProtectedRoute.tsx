import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading, hasOnboarding } = useAuthContext();
  const location = useLocation();
  const [showTimeout, setShowTimeout] = useState(false);

  const currentPath = location.pathname;

  // Reduced timeout from 5s to 3s to prevent long stuck states
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.warn("ProtectedRoute loading timeout - redirecting to auth");
        setShowTimeout(true);
      }, 3000);
      return () => clearTimeout(timeout);
    }
    setShowTimeout(false);
  }, [loading]);

  if (loading && showTimeout) {
    return <Navigate to="/auth" replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (currentPath === '/auth') return <>{children}</>;
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!hasOnboarding) {
    if (currentPath === '/questionnaire') return <>{children}</>;
    return <Navigate to="/questionnaire" replace />;
  }

  return <>{children}</>;
}