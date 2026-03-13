import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * PRODUCTION-READY TODAY'S MEALS HOOK
 * - Never crashes even if backend fails
 * - Always returns safe default values
 * - Per-user data isolation via user_id filter
 */

export interface MealEntry {
  id: string;
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  health_impact: string;
  scanned_at: string;
  image_url?: string;
}

export function useTodayMeals() {
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user safely
      let user;
      try {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      } catch (authError) {
        console.warn('Failed to get user:', authError);
        setMeals([]);
        setLoading(false);
        return;
      }

      if (!user) {
        setMeals([]);
        setLoading(false);
        return;
      }

      // Get today's date range in USER'S LOCAL TIMEZONE
      // This ensures "today" is based on user's location, not server UTC
      // Get midnight in user's local timezone, converted to UTC for query
      const localMidnight = new Date();
      localMidnight.setHours(0, 0, 0, 0);
      
      // localMidnight is already in local time, toISOString converts to UTC automatically
      const todayStart = localMidnight.toISOString();
      const tomorrowStart = new Date(localMidnight.getTime() + 24 * 60 * 60 * 1000).toISOString();

      // Fetch ONLY this user's meals (per-user data isolation)
      const { data, error: fetchError } = await supabase
        .from("food_scans")
        .select("id, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, health_impact, scanned_at, image_url")
        .eq("user_id", user.id)  // CRITICAL: Per-user data isolation
        .gte("scanned_at", todayStart)
        .lt("scanned_at", tomorrowStart)
        .order("scanned_at", { ascending: false })
        .limit(100); // Safety limit

      if (fetchError) {
        console.error("Error fetching meals:", fetchError);
        setError(fetchError.message);
        setMeals([]); // Always return empty array, not undefined
      } else {
        // Validate and sanitize data
        const validMeals = (data || []).map(meal => ({
          id: meal.id || '',
          food_name: typeof meal.food_name === 'string' ? meal.food_name : 'Unknown',
          calories: typeof meal.calories === 'number' ? meal.calories : 0,
          protein_g: typeof meal.protein_g === 'number' ? meal.protein_g : 0,
          carbs_g: typeof meal.carbs_g === 'number' ? meal.carbs_g : 0,
          fat_g: typeof meal.fat_g === 'number' ? meal.fat_g : 0,
          fiber_g: typeof meal.fiber_g === 'number' ? meal.fiber_g : 0,
          health_impact: typeof meal.health_impact === 'string' ? meal.health_impact : 'neutral',
          scanned_at: meal.scanned_at || new Date().toISOString(),
          image_url: typeof meal.image_url === 'string' ? meal.image_url : undefined,
        }));
        setMeals(validMeals);
      }
    } catch (e: unknown) {
      console.error("useTodayMeals error:", e);
      const errorMessage = e instanceof Error ? e.message : "Failed to fetch meals";
      setError(errorMessage);
      setMeals([]); // Always return empty array, not undefined
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch wrapped in error handling
    try {
      fetchMeals();
    } catch (e) {
      console.warn('Initial fetchMeals failed:', e);
    }

    // Set up realtime subscription (optional - non-blocking)
    let channel: ReturnType<typeof supabase.channel> | null = null;
    
    try {
      channel = supabase
        .channel("food_scans_changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "food_scans",
          },
          () => {
            // Force refresh on realtime changes - wrapped in try-catch
            try {
              fetchMeals();
            } catch (e) {
              console.warn('Realtime fetchMeals callback error:', e);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('Today meals channel error');
          }
        });
    } catch (subError) {
      console.warn('Failed to set up realtime subscription:', subError);
      // Non-critical - app works without realtime
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          console.warn('Failed to remove channel:', e);
        }
      }
    };
  }, [fetchMeals]);

  return {
    meals,
    loading,
    error,
    refetch: fetchMeals,
  };
}
