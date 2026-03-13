import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';

interface AuthRouteProps {
  children: React.ReactNode;
}

export function AuthRoute({ children }: AuthRouteProps) {
  const { isAuthenticated, loading, hasOnboarding } = useAuthContext();
  const [showTimeout, setShowTimeout] = useState(false);

  // Reduced timeout from 5s to 3s
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.warn("AuthRoute loading timeout - showing content");
        setShowTimeout(true);
      }, 3000);
      return () => clearTimeout(timeout);
    }
    setShowTimeout(false);
  }, [loading]);

  if (loading && !showTimeout) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated && hasOnboarding) {
    return <Navigate to="/home" replace />;
  }

  if (isAuthenticated && !hasOnboarding) {
    return <Navigate to="/questionnaire" replace />;
  }

  return <>{children}</>;
}