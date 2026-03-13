import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';

/**
 * LIFE SCORE ADJUSTMENT HOOK
 * 
 * Automatically triggers score adjustment check when:
 * - User opens the app (once per session)
 * - Enough time has passed since last adjustment
 * 
 * Adjustment rules:
 * - Score < 74: Can change every 2 days by ±1 or ±2
 * - Score >= 74: Can change every 4 days by ±1 or ±2
 */

const SESSION_CHECK_KEY = 'eatgen_weekly_score_checked';

interface AdjustmentResult {
  success: boolean;
  adjusted: boolean;
  previousScore?: number;
  newScore?: number;
  adjustment?: number;
  reason?: string;
  error?: string;
}

export function useWeeklyScoreAdjustment(onScoreAdjusted?: (result: AdjustmentResult) => void) {
  const { user, loading: authLoading } = useAuthContext();
  const checkedRef = useRef(false);

  const checkAndAdjust = useCallback(async (): Promise<AdjustmentResult | null> => {
    if (!user) return null;

    try {
      // Get fresh session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('No valid session for weekly score adjustment');
        return null;
      }

      console.log('[WeeklyScore] Checking for score adjustment...');

      const { data, error } = await supabase.functions.invoke('adjust-weekly-score', {
        body: {},
      });

      if (error) {
        console.error('[WeeklyScore] Error:', error);
        return { success: false, adjusted: false, error: error.message };
      }

      console.log('[WeeklyScore] Result:', data);
      return data as AdjustmentResult;

    } catch (e) {
      console.error('[WeeklyScore] Exception:', e);
      return { success: false, adjusted: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }, [user]);

  // Check once per app session (on first load after auth)
  useEffect(() => {
    if (authLoading || !user || checkedRef.current) return;

    // Check if we already did this check in this browser session
    const sessionChecked = sessionStorage.getItem(SESSION_CHECK_KEY);
    if (sessionChecked === user.id) {
      checkedRef.current = true;
      return;
    }

    // Delay the check slightly to not block initial render
    const timer = setTimeout(async () => {
      checkedRef.current = true;
      sessionStorage.setItem(SESSION_CHECK_KEY, user.id);

      const result = await checkAndAdjust();
      
      if (result?.adjusted && onScoreAdjusted) {
        onScoreAdjusted(result);
      }
    }, 3000); // Wait 3 seconds after auth to check

    return () => clearTimeout(timer);
  }, [user, authLoading, checkAndAdjust, onScoreAdjusted]);

  return {
    checkAndAdjust,
  };
}
