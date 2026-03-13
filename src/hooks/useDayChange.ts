import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalDateKey, msUntilMidnight } from '@/lib/timezone-utils';

/**
 * Hook to detect day changes in user's local timezone
 * Automatically refreshes data when the day changes (at midnight)
 * Also refreshes when app comes to foreground on a new day
 */
export function useDayChange(onDayChange?: () => void) {
  const [currentDateKey, setCurrentDateKey] = useState(() => getLocalDateKey());
  const lastCheckedRef = useRef(currentDateKey);
  
  const checkDayChange = useCallback(() => {
    const newDateKey = getLocalDateKey();
    if (newDateKey !== lastCheckedRef.current) {
      lastCheckedRef.current = newDateKey;
      setCurrentDateKey(newDateKey);
      onDayChange?.();
      return true;
    }
    return false;
  }, [onDayChange]);
  
  useEffect(() => {
    // Set timer for midnight
    const scheduleNextCheck = () => {
      const msToMidnight = msUntilMidnight();
      // Add 100ms buffer to ensure we're past midnight
      return setTimeout(() => {
        checkDayChange();
        // Re-schedule for next midnight
        scheduleNextCheck();
      }, msToMidnight + 100);
    };
    
    const midnightTimer = scheduleNextCheck();
    
    // Check on visibility change (app foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkDayChange();
      }
    };
    
    // Check on window focus
    const handleFocus = () => {
      checkDayChange();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkDayChange]);
  
  return {
    currentDateKey,
    checkDayChange,
  };
}
