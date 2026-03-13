import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  safeGetHealthAnalysis,
  safeGetFoodScans,
  safeGetUserLimits,
  DEFAULT_HEALTH_SCORE,
  DEFAULT_LIMITS,
  DEFAULT_MACROS,
  LOCAL_HEALTH_RESULTS_KEY,
} from '@/lib/supabase-safe';

const CACHE_KEY_PREFIX = 'eatgen_health_data_';

interface HealthData {
  healthScore: number;
  healthSummary: string;
  recommendations: string[];
  foodScans: any[];
  limits: typeof DEFAULT_LIMITS;
  macros: typeof DEFAULT_MACROS;
  loading: boolean;
  dataReady: boolean; // True only when fresh data is loaded for current user
  refetch: () => Promise<void>;
}

interface CachedHealthData {
  healthScore: number;
  healthSummary: string;
  recommendations: string[];
}

// Get cached data from localStorage for specific user
function getCachedData(userId: string | null): CachedHealthData | null {
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
function setCachedData(userId: string | null, data: CachedHealthData) {
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

/**
 * Hook to fetch health data with safe fallbacks
 * Uses stale-while-revalidate: shows cached data instantly, fetches fresh in background
 */
export function useHealthData(selectedDate?: Date): HealthData {
  const { user, loading: authLoading } = useAuthContext();
  const prevUserIdRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initializedRef = useRef(false);
  
  // Initialize with defaults - only load from cache after user is confirmed
  const [healthScore, setHealthScore] = useState(DEFAULT_HEALTH_SCORE);
  const [healthSummary, setHealthSummary] = useState('Complete the questionnaire to see your Life Score.');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [foodScans, setFoodScans] = useState<any[]>([]);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [macros] = useState(DEFAULT_MACROS);
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false); // Track when fresh data is loaded

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
          if (cached) {
            setHealthScore(cached.healthScore);
            setHealthSummary(cached.healthSummary);
            setRecommendations(cached.recommendations);
          } else {
            setHealthScore(DEFAULT_HEALTH_SCORE);
            setHealthSummary('Complete the questionnaire to see your Life Score.');
            setRecommendations([]);
          }
        } else {
          setHealthScore(DEFAULT_HEALTH_SCORE);
          setHealthSummary('Complete the questionnaire to see your Life Score.');
          setRecommendations([]);
          // For logged out users, data is "ready" with defaults
          setDataReady(true);
        }
        prevUserIdRef.current = currentUserId;
        initializedRef.current = true;
        setLoading(false);
      }
    }
  }, [user?.id, authLoading]);

  const getLocalResults = useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_HEALTH_RESULTS_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as {
        healthScore?: number;
        healthSummary?: string;
        recommendations?: string[];
        habits?: string[];
      };
    } catch {
      return null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    if (authLoading) return;

    const local = getLocalResults();

    if (!user) {
      // Guest mode
      if (local?.healthScore != null) {
        setHealthScore(local.healthScore);
        setHealthSummary(local.healthSummary ?? 'Your Life Score is ready.');
        setRecommendations(local.recommendations ?? local.habits ?? []);
      }
      setDataReady(true);
      setLoading(false);
      return;
    }

    fetchingRef.current = true;

    try {
      const [healthAnalysis, scans, userLimits] = await Promise.all([
        safeGetHealthAnalysis(user.id),
        safeGetFoodScans(user.id, selectedDate || new Date()),
        safeGetUserLimits(user.id),
      ]);

      const rawScore = (healthAnalysis as any).health_score ?? local?.healthScore ?? 0;
      const displayScore = rawScore;
      
      const newHealthSummary = (healthAnalysis as any).health_summary ?? local?.healthSummary ?? 'Complete the questionnaire to see your Life Score.';
      const newRecommendations = (healthAnalysis as any).recommendations ?? local?.recommendations ?? local?.habits ?? [];

      setHealthScore(displayScore);
      setHealthSummary(newHealthSummary);
      setRecommendations(newRecommendations);
      setFoodScans(scans);
      setLimits(userLimits);

      // Cache for this specific user
      setCachedData(user.id, {
        healthScore: displayScore,
        healthSummary: newHealthSummary,
        recommendations: newRecommendations,
      });
      
      // Mark data as ready after successful fetch
      setDataReady(true);
    } catch (error) {
      console.warn('Failed to fetch health data:', error);
      if (local?.healthScore != null) {
        setHealthScore(local.healthScore);
        setHealthSummary(local.healthSummary ?? 'Your Life Score is ready.');
        setRecommendations(local.recommendations ?? local.habits ?? []);
      }
      // Even on error, mark as ready so we don't block forever
      setDataReady(true);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [user, authLoading, selectedDate, getLocalResults]);

  // Set up realtime subscription once - wrapped in comprehensive error handling
  useEffect(() => {
    if (!user?.id) {
      try {
        fetchData();
      } catch (e) {
        console.warn('Guest fetchData failed:', e);
      }
      return;
    }

    // Initial fetch wrapped in try-catch
    try {
      fetchData();
    } catch (e) {
      console.warn('Initial fetchData failed:', e);
    }

    // Realtime subscription with full error protection
    try {
      // Subscribe to both food_scans and health_analysis changes
      channelRef.current = supabase
        .channel(`health_data_${user.id}`)
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
              fetchData();
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
              fetchData();
            } catch (e) {
              console.warn('Realtime health_analysis callback error:', e);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('Health data channel error');
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
  }, [user?.id, fetchData]);

  return {
    healthScore,
    healthSummary,
    recommendations,
    foodScans,
    limits,
    macros,
    loading,
    dataReady,
    refetch: async () => {
      fetchingRef.current = false;
      await fetchData();
    },
  };
}
