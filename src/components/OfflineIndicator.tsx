import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

/**
 * Shows a subtle offline indicator when network is unavailable
 * Automatically hides when back online
 */
export function OfflineIndicator() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 backdrop-blur-sm py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium text-amber-950 animate-fade-in">
      <WifiOff className="w-4 h-4" />
      <span>You're offline. Some features may be limited.</span>
    </div>
  );
}
