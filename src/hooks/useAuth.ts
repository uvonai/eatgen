import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Safe auth hook - never blocks app startup
 * Returns loading state initially, then resolves with user/session or null
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;
        try {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          setLoading(false);
        } catch (error) {
          console.warn('Auth state change error:', error);
          if (mounted) setLoading(false);
        }
      }
    );

    // THEN check for existing session
    const initSession = async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (mounted) {
          setSession(existingSession);
          setUser(existingSession?.user ?? null);
        }
      } catch (error) {
        console.warn('Failed to get session:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initSession();

    return () => {
      mounted = false;
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.warn('Failed to unsubscribe:', error);
      }
    };
  }, []);

  return { user, session, loading, isAuthenticated: !!user };
}
