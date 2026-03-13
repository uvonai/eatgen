import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { getLocalDateKey } from "@/lib/timezone-utils";

/**
 * PRODUCTION-READY DAILY SUMMARY HOOK
 * - Never crashes even if backend fails
 * - Per-user caching: different users get their own cached data
 * - Instant display from cache, silent background updates
 * - Frontend only displays data - NO calculations
 */

const CACHE_KEY_PREFIX = 'eatgen_daily_summary_';

interface DailySummaryData {
  meals: Array<{
    id: string;
    food_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    health_impact: string;
    scanned_at: string;
    image_url?: string | null;
    ai_analysis?: any;
  }>;
  consumedMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  remainingMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
  };
  impactCards: Array<{
    id: number;
    title: string;
    value: string;
    subtext: string;
    type: string;
    color: string;
    isRisky?: boolean;
  }>;
  mealCount: number;
  dataDate: string; // Track which date the current data is for
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Safe default values - app works even without backend
const defaultData: Omit<DailySummaryData, 'loading' | 'error' | 'refetch' | 'dataDate'> = {
  meals: [],
  consumedMacros: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  remainingMacros: { calories: 2000, protein: 120, carbs: 250, fat: 65, fiber: 30, sugar: 50, sodium: 2300 },
  impactCards: [
    { id: 1, title: "Food Impact", value: "0 days", subtext: "No meals logged yet", type: "food", color: "emerald" },
    { id: 2, title: "Calories Today", value: "0", subtext: "Start logging meals", type: "calories", color: "amber" },
    { id: 3, title: "Risk Signals", value: "0", subtext: "All clear today", type: "risk", color: "emerald" },
  ],
  mealCount: 0,
};

// Get cached data from localStorage for specific user (timezone-aware)
function getCachedData(userId: string | null): Omit<DailySummaryData, 'loading' | 'error' | 'refetch'> | null {
  if (!userId) return null;
  
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Check if cache is from today using timezone-aware date key
      const cacheDate = parsed._cacheDate;
      const today = getLocalDateKey();
      if (cacheDate === today && parsed.data) {
        return parsed.data;
      }
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

// Save data to localStorage cache for specific user (timezone-aware)
function setCachedData(userId: string | null, data: Omit<DailySummaryData, 'loading' | 'error' | 'refetch'>) {
  if (!userId) return;
  
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify({
      _cacheDate: getLocalDateKey(), // Use timezone-aware date key
      data,
    }));
  } catch {
    // Ignore cache errors
  }
}

export function useDailySummary(selectedDate?: Date): DailySummaryData {
  const { user, loading: authLoading } = useAuthContext();
  const prevUserIdRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initializedRef = useRef(false);
  
  // Initialize with default data - only load from cache after user is confirmed
  const [data, setData] = useState<Omit<DailySummaryData, 'loading' | 'error' | 'refetch'>>({
    ...defaultData,
    dataDate: (selectedDate || new Date()).toDateString(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load cached data once user is available and auth is done
  useEffect(() => {
    const currentUserId = user?.id || null;
    
    // When auth finishes loading
    if (!authLoading) {
      // User changed or first load
      if (prevUserIdRef.current !== currentUserId || !initializedRef.current) {
        if (currentUserId) {
          const cached = getCachedData(currentUserId);
          setData(cached ? { ...cached, dataDate: (selectedDate || new Date()).toDateString() } : { ...defaultData, dataDate: (selectedDate || new Date()).toDateString() });
        } else {
          setData({ ...defaultData, dataDate: (selectedDate || new Date()).toDateString() });
        }
        prevUserIdRef.current = currentUserId;
        initializedRef.current = true;
        setLoading(false);
      }
    }
  }, [user?.id, authLoading]);

  const fetchSummary = useCallback(async () => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    
    // Wait for auth to finish
    if (authLoading) return;
    
    // No user = show defaults (not an error)
    if (!user) {
      setData({ ...defaultData, dataDate: (selectedDate || new Date()).toDateString() });
      setLoading(false);
      setError(null);
      return;
    }

    fetchingRef.current = true;
    // Don't show loading spinner - we have cached data

    try {
      setError(null);

      // Get fresh session to ensure token is not expired
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (!freshSession?.access_token) {
        console.warn('No valid session for daily summary fetch');
        setLoading(false);
        return;
      }

      // Call backend edge function with fresh token
      const timezoneOffset = new Date().getTimezoneOffset();
      
      const { data: response, error: fnError } = await supabase.functions.invoke('get-daily-summary', {
        body: {
          userId: user.id,
          date: selectedDate?.toISOString() || new Date().toISOString(),
          timezoneOffset,
        },
      });

      if (fnError) {
        console.error('Daily summary fetch error:', fnError);
        setError(fnError.message);
        return;
      }

      // Validate response and update state
      if (response?.success && response?.data) {
        const responseData = response.data;
        const fetchedDateStr = (selectedDate || new Date()).toDateString();
        const newData = {
          meals: Array.isArray(responseData.meals) ? responseData.meals : [],
          consumedMacros: responseData.consumedMacros || defaultData.consumedMacros,
          remainingMacros: responseData.remainingMacros || defaultData.remainingMacros,
          impactCards: Array.isArray(responseData.impactCards) ? responseData.impactCards : defaultData.impactCards,
          mealCount: typeof responseData.mealCount === 'number' ? responseData.mealCount : 0,
          dataDate: fetchedDateStr,
        };
        setData(newData);
        // Cache without dataDate since it's session-specific
        const { dataDate: _, ...cacheData } = newData;
        setCachedData(user.id, cacheData as any);
        setError(null);
      }
    } catch (e: unknown) {
      console.error('useDailySummary error:', e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch daily summary';
      setError(errorMessage);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [user, authLoading, selectedDate]);

  // Set up realtime subscription once - with comprehensive error handling
  useEffect(() => {
    if (!user?.id) return;

    // Initial fetch wrapped in try-catch
    try {
      fetchSummary();
    } catch (e) {
      console.warn('Initial fetchSummary failed:', e);
    }

    // Set up realtime subscription with full error protection
    try {
      channelRef.current = supabase
        .channel(`daily_summary_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'food_scans',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // Immediate refetch on any change - wrapped in try-catch
            try {
              fetchingRef.current = false; // Allow new fetch
              fetchSummary();
            } catch (e) {
              console.warn('Realtime fetchSummary callback error:', e);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('Daily summary channel error');
          }
        });
    } catch (subError) {
      console.warn('Failed to set up realtime subscription:', subError);
    }

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch (e) {
          console.warn('Failed to remove channel:', e);
        }
        channelRef.current = null;
      }
    };
  }, [user?.id, fetchSummary]);

  // Refetch when date changes
  useEffect(() => {
    if (user?.id) {
      fetchingRef.current = false;
      fetchSummary();
    }
  }, [selectedDate?.toDateString()]);

  return {
    ...data,
    loading,
    error,
    refetch: async () => {
      fetchingRef.current = false;
      await fetchSummary();
    },
  };
}
