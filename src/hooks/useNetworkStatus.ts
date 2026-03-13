import { useState, useEffect } from 'react';

/**
 * Hook to detect online/offline status
 * Returns true if online, false if offline
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // Safe check for SSR and environments without navigator
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return true;
    }
    return navigator.onLine ?? true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
