import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

/**
 * PRODUCTION-READY PROGRESS DATA HOOK
 * - Never crashes even if backend fails
 * - Per-user caching: instant display from cache
 * - Silent background updates - no flashing
 */

const CACHE_KEY_PREFIX = 'eatgen_progress_data_';

interface ProgressDataState {
  chartData: Record<string, number[]>;
  weeklyInsights: {
    average: number;
    bestDay: string;
    consistency: string;
    changeFromLastWeek: number;
  };
  monthlyChange: {
    score: number;
    meals: number;
    healthyPercentage: number;
  };
  highlights: string[];
}

interface ProgressData extends ProgressDataState {
  loading: boolean;
  dataReady: boolean; // True only when fresh data is loaded for current user
  error: string | null;
  refetch: () => void;
}

// Safe default values
const defaultData: ProgressDataState = {
  chartData: {
    "7d": [70, 70, 70, 70, 70, 70, 70],
    "30d": Array(30).fill(70),
    "6m": [70, 70, 70, 70, 70, 70],
    "1y": Array(12).fill(70),
  },
  weeklyInsights: {
    average: 70,
    bestDay: "—",
    consistency: "—",
    changeFromLastWeek: 0,
  },
  monthlyChange: {
    score: 0,
    meals: 0,
    healthyPercentage: 0,
  },
  highlights: ["Start scanning meals to see your progress"],
};

// Get cached data from localStorage for specific user
function getCachedData(userId: string | null): ProgressDataState | null {
  if (!userId) return null;
  
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.data) {
        return parsed.data;
      }
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

// Save data to localStorage cache for specific user
function setCachedData(userId: string | null, data: ProgressDataState) {
  if (!userId) return;
  
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify({
      _cacheTime: Date.now(),
      data,
    }));
  } catch {
    // Ignore cache errors
  }
}

export function useProgressData(): ProgressData {
  const { user, loading: authLoading } = useAuthContext();
  const prevUserIdRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initializedRef = useRef(false);
  
  // Initialize with default data - only load from cache after user is confirmed
  const [data, setData] = useState<ProgressDataState>(defaultData);
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false); // Track when fresh data is loaded
  const [error, setError] = useState<string | null>(null);

  // Load cached data once user is available and auth is done
  useEffect(() => {
    const currentUserId = user?.id || null;
    
    // When auth finishes loading
    if (!authLoading) {
      // User changed or first load
      if (prevUserIdRef.current !== currentUserId || !initializedRef.current) {
        // Reset dataReady when user changes - must fetch fresh data
        setDataReady(false);
        
        if (currentUserId) {
          const cached = getCachedData(currentUserId);
          setData(cached || defaultData);
        } else {
          setData(defaultData);
          // For logged out users, data is "ready" with defaults
          setDataReady(true);
        }
        prevUserIdRef.current = currentUserId;
        initializedRef.current = true;
        setLoading(false);
      }
    }
  }, [user?.id, authLoading]);

  const fetchProgressData = useCallback(async () => {
    if (fetchingRef.current) return;
    if (authLoading) return;
    
    if (!user) {
      setData(defaultData);
      setDataReady(true);
      setLoading(false);
      setError(null);
      return;
    }

    fetchingRef.current = true;

    try {
      setError(null);

      // Get fresh session to ensure token is not expired
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (!freshSession?.access_token) {
        console.warn('No valid session for progress data fetch');
        setLoading(false);
        return;
      }

      const timezoneOffset = new Date().getTimezoneOffset();
      
      const { data: response, error: fnError } = await supabase.functions.invoke('get-progress-data', {
        body: { userId: user.id, timezoneOffset },
      });

      if (fnError) {
        console.error('Progress data fetch error:', fnError);
        setError(fnError.message);
        return;
      }

      if (response?.success && response?.data) {
        const responseData = response.data;
        const newData: ProgressDataState = {
          chartData: responseData.chartData && typeof responseData.chartData === 'object' 
            ? responseData.chartData 
            : defaultData.chartData,
          weeklyInsights: responseData.weeklyInsights && typeof responseData.weeklyInsights === 'object'
            ? {
                average: typeof responseData.weeklyInsights.average === 'number' ? responseData.weeklyInsights.average : 70,
                bestDay: typeof responseData.weeklyInsights.bestDay === 'string' ? responseData.weeklyInsights.bestDay : '—',
                consistency: typeof responseData.weeklyInsights.consistency === 'string' ? responseData.weeklyInsights.consistency : '—',
                changeFromLastWeek: typeof responseData.weeklyInsights.changeFromLastWeek === 'number' ? responseData.weeklyInsights.changeFromLastWeek : 0,
              }
            : defaultData.weeklyInsights,
          monthlyChange: responseData.monthlyChange && typeof responseData.monthlyChange === 'object'
            ? {
                score: typeof responseData.monthlyChange.score === 'number' ? responseData.monthlyChange.score : 0,
                meals: typeof responseData.monthlyChange.meals === 'number' ? responseData.monthlyChange.meals : 0,
                healthyPercentage: typeof responseData.monthlyChange.healthyPercentage === 'number' ? responseData.monthlyChange.healthyPercentage : 0,
              }
            : defaultData.monthlyChange,
          highlights: Array.isArray(responseData.highlights) 
            ? responseData.highlights.filter((h: unknown) => typeof h === 'string')
            : defaultData.highlights,
        };
        setData(newData);
        setCachedData(user.id, newData);
        setError(null);
        // Mark data as ready after successful fetch
        setDataReady(true);
      }
    } catch (e: unknown) {
      console.error('useProgressData error:', e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch progress data';
      setError(errorMessage);
      // Even on error, mark as ready so we don't block forever
      setDataReady(true);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [user, authLoading]);

  // Set up realtime subscription once - wrapped in comprehensive error handling
  useEffect(() => {
    if (!user?.id) return;

    // Initial fetch wrapped in try-catch
    try {
      fetchProgressData();
    } catch (e) {
      console.warn('Initial fetchProgressData failed:', e);
    }

    // Realtime subscription with full error protection
    try {
      // Subscribe to both food_scans and health_analysis changes
      channelRef.current = supabase
        .channel(`progress_data_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'food_scans',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            try {
              fetchingRef.current = false;
              fetchProgressData();
            } catch (e) {
              console.warn('Realtime food_scans callback error:', e);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'health_analysis',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            try {
              fetchingRef.current = false;
              fetchProgressData();
            } catch (e) {
              console.warn('Realtime health_analysis callback error:', e);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('Progress data channel error');
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
  }, [user?.id, fetchProgressData]);

  return {
    ...data,
    loading,
    dataReady,
    error,
    refetch: () => {
      fetchingRef.current = false;
      fetchProgressData();
    },
  };
}
