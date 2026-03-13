/**
 * Safe Supabase wrapper - all backend calls are optional and never block the app
 * Frontend must work even if Supabase is unavailable
 */

import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

// Default/mock values for when backend is unavailable
// NOTE: We keep this neutral (0) to avoid showing a misleading "mock" score.
export const DEFAULT_HEALTH_SCORE = 0;

// Local cache of the last calculated health results (useful for guest users)
export const LOCAL_HEALTH_RESULTS_KEY = "eatvia:last_health_results";

export const DEFAULT_LIMITS = {
  free_scans_used: 0,
  max_free_scans: 10,
  is_premium: false,
};

export const DEFAULT_MACROS = {
  protein_left: 92,
  calories_left: 1928,
  carbs_left: 267,
  fats_left: 53,
  fiber_left: 25,
  sugar_left: 40,
};

// Safe auth functions
export async function safeGetSession(): Promise<{ user: User | null; session: Session | null }> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('Session fetch failed:', error.message);
      return { user: null, session: null };
    }
    return { user: session?.user ?? null, session };
  } catch (error) {
    console.warn('Session fetch error:', error);
    return { user: null, session: null };
  }
}

export async function safeSignUp(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Sign up error:', error);
    return { success: false, error: 'Sign up failed. Please try again.' };
  }
}

export async function safeSignIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Sign in error:', error);
    return { success: false, error: 'Sign in failed. Please try again.' };
  }
}

export async function safeSignOut(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false, error: 'Sign out failed. Please try again.' };
  }
}

export async function safeSignInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    // Use Lovable Cloud managed OAuth - do NOT use supabase.auth.signInWithOAuth directly
    const { lovable } = await import('@/integrations/lovable');
    const { error } = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (error) {
      return { success: false, error: String(error) };
    }
    return { success: true };
  } catch (error) {
    console.error('Google sign in error:', error);
    return { success: false, error: 'Google sign in failed. Please try again.' };
  }
}

export async function safeSignInAnonymously(): Promise<{ success: boolean; error?: string; userId?: string }> {
  // Retry up to 3 times with increasing delay to handle transient network failures
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        // If it's a network error and we have retries left, try again
        if (attempt < 3 && (error.message?.includes('fetch') || error.status === 0)) {
          console.warn(`Anonymous sign in attempt ${attempt} failed (network), retrying...`);
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        return { success: false, error: error.message };
      }
      return { success: true, userId: data.user?.id };
    } catch (error) {
      if (attempt < 3) {
        console.warn(`Anonymous sign in attempt ${attempt} failed, retrying...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      console.error('Anonymous sign in error:', error);
      return { success: false, error: 'Guest sign in failed. Please check your connection and try again.' };
    }
  }
  return { success: false, error: 'Guest sign in failed after multiple attempts.' };
}

// Check if user has completed onboarding
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('onboarding_data')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    return !error && data !== null;
  } catch (error) {
    console.warn('Failed to check onboarding status:', error);
    return false;
  }
}

// Safe database functions
export async function safeGetUserLimits(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_limits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error || !data) {
      return DEFAULT_LIMITS;
    }
    return data;
  } catch (error) {
    console.warn('Failed to fetch user limits:', error);
    return DEFAULT_LIMITS;
  }
}

export async function safeGetHealthAnalysis(userId: string) {
  try {
    const { data, error } = await supabase
      .from('health_analysis')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return {
        health_score: null,
        health_summary: 'Complete the questionnaire to see your Life Score.',
        recommendations: [],
      };
    }
    return data;
  } catch (error) {
    console.warn('Failed to fetch health analysis:', error);
    return {
      health_score: null,
      health_summary: 'Complete the questionnaire to see your Life Score.',
      recommendations: [],
    };
  }
}

export async function safeGetFoodScans(userId: string, date?: Date) {
  try {
    let query = supabase
      .from('food_scans')
      .select('*')
      .eq('user_id', userId)
      .order('scanned_at', { ascending: false });
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      query = query
        .gte('scanned_at', startOfDay.toISOString())
        .lte('scanned_at', endOfDay.toISOString());
    }
    
    const { data, error } = await query.limit(50);
    
    if (error || !data) {
      return [];
    }
    return data;
  } catch (error) {
    console.warn('Failed to fetch food scans:', error);
    return [];
  }
}

export async function safeSaveOnboardingData(userId: string, data: Record<string, unknown>) {
  try {
    const { error } = await supabase
      .from('onboarding_data')
      .upsert({
        user_id: userId,
        ...data,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });
    
    if (error) {
      console.error('Failed to save onboarding data:', error);
      return { success: false };
    }
    return { success: true };
  } catch (error) {
    console.error('Save onboarding error:', error);
    return { success: false };
  }
}

export async function safeGetOnboardingData(userId: string) {
  try {
    const { data, error } = await supabase
      .from('onboarding_data')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error || !data) {
      return null;
    }
    return data;
  } catch (error) {
    console.warn('Failed to fetch onboarding data:', error);
    return null;
  }
}

// Safe edge function calls
export async function safeAnalyzeFood(imageBase64: string, userId?: string) {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-food', {
      body: { imageBase64, userId },
    });
    
    if (error) {
      console.error('Food analysis error:', error);
      return { success: false, error: 'Analysis failed' };
    }
    return { success: true, analysis: data.analysis };
  } catch (error) {
    console.error('Food analysis error:', error);
    return { success: false, error: 'Analysis unavailable' };
  }
}

export async function safeCalculateHealthScore(
  userIdOrParams: string | { userId?: string; onboardingData?: Record<string, unknown> }
) {
  const params = typeof userIdOrParams === 'string' ? { userId: userIdOrParams } : userIdOrParams;

  try {
    const { data, error } = await supabase.functions.invoke('calculate-health-score', {
      body: {
        userId: params.userId,
        onboardingData: params.onboardingData,
      },
    });

    if (error) {
      console.error('Health score calculation error:', error);
      return { success: false, health_score: DEFAULT_HEALTH_SCORE, error: error.message };
    }

    return { success: true, ...data };
  } catch (error) {
    console.error('Health score calculation error:', error);
    return { success: false, health_score: DEFAULT_HEALTH_SCORE, error: 'Calculation unavailable' };
  }
}

// Check if user can scan (has scans left or is premium)
export async function canUserScan(userId: string): Promise<boolean> {
  const limits = await safeGetUserLimits(userId);
  if (limits.is_premium) return true;
  return limits.free_scans_used < limits.max_free_scans;
}
