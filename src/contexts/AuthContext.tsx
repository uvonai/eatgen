import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { hasCompletedOnboarding } from '@/lib/supabase-safe';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  hasOnboarding: boolean;
  checkOnboardingStatus: () => Promise<void>;
  isAnonymous: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAuthenticated: false,
  hasOnboarding: false,
  checkOnboardingStatus: async () => {},
  isAnonymous: false,
  isAdmin: false,
});

// Check admin status via edge function (secure - no frontend logic)
async function checkAdminStatus(): Promise<boolean> {
  try {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (!freshSession?.access_token) return false;
    
    const { data, error } = await supabase.functions.invoke('check-admin-status', {
      headers: { Authorization: `Bearer ${freshSession.access_token}` },
    });
    
    if (error) {
      console.warn('Admin check failed:', error);
      return false;
    }
    return data?.isAdmin === true;
  } catch (e) {
    console.warn('Admin check error:', e);
    return false;
  }
}

// Clear all user-specific cache when user changes
function clearUserCache(userId?: string) {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (
          key.startsWith('eatgen_daily_summary_') ||
          key.startsWith('eatgen_progress_data_') ||
          key.startsWith('eatgen_health_data_') ||
          key === 'eatgen_settings_cache' ||
          key.startsWith('eatgen_settings_cache_')
        )
      ) {
        if (userId && key.includes(userId)) continue;
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Failed to clear user cache:', e);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOnboarding, setHasOnboarding] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const prevUserIdRef = useRef<string | null>(null);
  const initDoneRef = useRef(false);
  const checkingRef = useRef(false);
  const mountedRef = useRef(true);

  // Safety timeout - NEVER stay loading more than 8 seconds
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current && loading) {
        console.warn('AuthContext: Safety timeout reached, forcing loading=false');
        setLoading(false);
      }
    }, 8000);
    return () => clearTimeout(safetyTimer);
  }, [loading]);

  const runAuthChecks = useCallback(async (targetUser: User) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    
    try {
      const [adminStatus, completed] = await Promise.all([
        checkAdminStatus().catch(() => false),
        hasCompletedOnboarding(targetUser.id).catch(() => false),
      ]);
      
      if (mountedRef.current) {
        setIsAdmin(adminStatus);
        setHasOnboarding(completed);
      }
    } catch (error) {
      console.warn('Auth checks failed:', error);
      if (mountedRef.current) {
        setIsAdmin(false);
        setHasOnboarding(false);
      }
    } finally {
      checkingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      if (user) {
        const completed = await hasCompletedOnboarding(user.id);
        if (mountedRef.current) setHasOnboarding(completed);
      } else {
        setHasOnboarding(false);
      }
    } catch (error) {
      console.warn('Failed to check onboarding status:', error);
      setHasOnboarding(false);
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mountedRef.current) return;
        
        try {
          const newUserId = newSession?.user?.id ?? null;
          const prevUserId = prevUserIdRef.current;
          
          // Clear cache when user changes
          if (prevUserId !== newUserId) {
            clearUserCache(newUserId ?? undefined);
            prevUserIdRef.current = newUserId;
          }
          
          setSession(newSession);
          setUser(newSession?.user ?? null);
          
          if (newSession?.user) {
            // Only run checks if initSession hasn't already handled this user
            if (initDoneRef.current && newUserId === prevUserId) {
              // Same user, already checked - just ensure loading is false
              setLoading(false);
              return;
            }
            // New user or first time from listener - run checks
            // Use queueMicrotask to avoid Supabase deadlock
            queueMicrotask(() => {
              if (mountedRef.current && newSession?.user) {
                runAuthChecks(newSession.user);
              }
            });
          } else {
            setIsAdmin(false);
            setHasOnboarding(false);
            setLoading(false);
          }
        } catch (error) {
          console.warn('Auth state change error:', error);
          if (mountedRef.current) setLoading(false);
        }
      }
    );

    // THEN check for existing session
    const initSession = async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        
        if (!mountedRef.current) return;
        
        setSession(existingSession);
        setUser(existingSession?.user ?? null);
        prevUserIdRef.current = existingSession?.user?.id ?? null;
        
        if (existingSession?.user) {
          await runAuthChecks(existingSession.user);
          initDoneRef.current = true;
        } else {
          setLoading(false);
          initDoneRef.current = true;
        }
      } catch (error) {
        console.warn('Failed to get session:', error);
        if (mountedRef.current) {
          setLoading(false);
          initDoneRef.current = true;
        }
      }
    };

    initSession();

    return () => {
      mountedRef.current = false;
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.warn('Failed to unsubscribe:', error);
      }
    };
  }, [runAuthChecks]);

  const isAnonymous = user?.is_anonymous ?? false;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      isAuthenticated: !!user,
      hasOnboarding,
      checkOnboardingStatus,
      isAnonymous,
      isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}