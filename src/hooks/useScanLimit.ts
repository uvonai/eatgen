/**
 * Device-based free scan tracking + RevenueCat-based premium status + Fair-use rate limiting
 * 
 * PRODUCTION-READY for App Store / Play Store
 * 
 * CRITICAL PRINCIPLES:
 * - RevenueCat is the ONLY source of truth for premium status on iOS
 * - Free scan = per DEVICE (tracked in backend via device ID)
 * - Premium users = 30 scans per calendar day (fair-use limit, server-side)
 * - Admin = always unlimited (checked via backend, stored in AuthContext)
 * - Never rely on local storage for premium status
 * 
 * Camera scan: 1 free scan per device lifetime (non-premium)
 * Describe food: 0 free scans (premium only)
 * Premium daily limit: 30 scans (resets at midnight user's timezone)
 * 
 * Device ID sources (in priority order):
 * 1. Cached device ID from localStorage (fast)
 * 2. Native device ID from Capacitor (ANDROID_ID / IDFV)
 * 3. Backend verification (authoritative, survives reinstall)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useRevenueCatContext } from "@/components/RevenueCatProvider";
import { isIOSNative } from "@/lib/revenuecat";
import { getTimezoneOffset } from "@/lib/timezone-utils";
import { toast } from "sonner";

// Local storage keys (for device tracking only, NOT premium status)
const DEVICE_ID_KEY = "eatvia:device_id_v2";
const DEVICE_FREE_SCAN_KEY = "eatvia:device_free_scan_used_v2";
const BACKEND_CHECK_DONE_KEY = "eatvia:backend_check_done";
const PREMIUM_SCAN_COUNT_KEY = "eatvia:premium_scan_count";
const PREMIUM_SCAN_DATE_KEY = "eatvia:premium_scan_date";

interface ScanLimitState {
  isPremium: boolean;
  deviceFreeScanUsed: boolean;
  canScan: boolean;
  loading: boolean;
  premiumDailyLimitReached: boolean;
}

/**
 * Generate or retrieve a unique device ID
 */
async function getOrCreateDeviceId(): Promise<string> {
  // Try to get existing device ID from localStorage (fast path)
  try {
    const existingId = localStorage.getItem(DEVICE_ID_KEY);
    if (existingId && existingId.length >= 20) {
      return existingId;
    }
  } catch {
    // localStorage not available
  }

  let deviceId: string;

  // Try to get native device ID
  if (Capacitor.isNativePlatform()) {
    try {
      const { Device } = await import("@capacitor/device");
      const [idInfo, deviceInfo] = await Promise.all([
        Device.getId(),
        Device.getInfo()
      ]);
      
      const fingerprint = `${idInfo.identifier}_${deviceInfo.model}_${deviceInfo.platform}`;
      deviceId = `native_${fingerprint}`;
    } catch (e) {
      console.warn("Failed to get native device ID:", e);
      deviceId = `fallback_${Date.now()}_${crypto.randomUUID()}`;
    }
  } else {
    deviceId = `web_${crypto.randomUUID()}`;
  }

  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // localStorage not available
  }

  return deviceId;
}

/**
 * Get platform name for logging
 */
function getPlatform(): string {
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform();
  }
  return "web";
}

/**
 * Check local storage for cached scan status (fast, offline-capable)
 */
function getLocalScanStatus(): boolean {
  try {
    return localStorage.getItem(DEVICE_FREE_SCAN_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Set local scan status cache
 */
function setLocalScanStatus(used: boolean): void {
  try {
    localStorage.setItem(DEVICE_FREE_SCAN_KEY, used ? "true" : "false");
  } catch {
    // localStorage not available
  }
}

/**
 * Check if backend verification was completed this session
 */
function hasCompletedBackendCheck(): boolean {
  try {
    return sessionStorage.getItem(BACKEND_CHECK_DONE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Mark backend check as complete for this session
 */
function markBackendCheckComplete(): void {
  try {
    sessionStorage.setItem(BACKEND_CHECK_DONE_KEY, "true");
  } catch {
    // sessionStorage not available
  }
}

/**
 * Get cached premium scan count for offline support
 */
function getCachedPremiumScanCount(): { count: number; date: string } {
  try {
    const count = parseInt(localStorage.getItem(PREMIUM_SCAN_COUNT_KEY) || "0", 10);
    const date = localStorage.getItem(PREMIUM_SCAN_DATE_KEY) || "";
    return { count, date };
  } catch {
    return { count: 0, date: "" };
  }
}

/**
 * Update cached premium scan count
 */
function setCachedPremiumScanCount(count: number, date: string): void {
  try {
    localStorage.setItem(PREMIUM_SCAN_COUNT_KEY, String(count));
    localStorage.setItem(PREMIUM_SCAN_DATE_KEY, date);
  } catch {
    // localStorage not available
  }
}

/**
 * Get today's date string in user's local timezone (YYYY-MM-DD)
 * Uses local date components, NOT toISOString() which returns UTC
 */
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Daily limit constant (not exposed to UI)
const PREMIUM_DAILY_LIMIT = 30;

export function useScanLimit() {
  const { user, isAdmin } = useAuthContext();
  
  // Get premium status from RevenueCat context (source of truth on iOS)
  const revenueCatContext = useRevenueCatContext();
  
  const [state, setState] = useState<ScanLimitState>(() => {
    const localUsed = getLocalScanStatus();
    return {
      isPremium: false,
      deviceFreeScanUsed: localUsed,
      canScan: !localUsed,
      loading: true,
      premiumDailyLimitReached: false,
    };
  });
  
  const deviceIdRef = useRef<string | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Check if device has used free scan (from backend + local fallback)
  const checkDeviceFreeScan = useCallback(async (): Promise<boolean> => {
    const localUsed = getLocalScanStatus();
    if (localUsed) {
      return true;
    }

    if (hasCompletedBackendCheck()) {
      return localUsed;
    }

    const deviceId = await getOrCreateDeviceId();
    deviceIdRef.current = deviceId;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { data, error } = await supabase.functions.invoke("check-device-scan", {
        body: {
          deviceId,
          action: "check",
          platform: getPlatform(),
        },
      });

      clearTimeout(timeoutId);

      if (error) {
        console.warn("Failed to check device scan status:", error);
        return localUsed;
      }

      const hasUsed = data?.hasUsedFreeScan === true;
      setLocalScanStatus(hasUsed);
      markBackendCheckComplete();

      return hasUsed;
    } catch (e) {
      console.warn("Error checking device scan:", e);
      return localUsed;
    }
  }, []);

  // Check premium daily scan limit (server-side)
  const checkPremiumDailyLimit = useCallback(async (): Promise<{ canScan: boolean; count: number }> => {
    const todayLocal = getLocalDateString();
    const cached = getCachedPremiumScanCount();
    
    // If cached date is different, it's a new day - reset cache
    if (cached.date !== todayLocal) {
      setCachedPremiumScanCount(0, todayLocal);
    }

    try {
      const { data, error } = await supabase.functions.invoke("check-premium-scan", {
        body: {
          action: "check",
          timezoneOffset: getTimezoneOffset(),
        },
      });

      if (error) {
        console.warn("Failed to check premium scan limit:", error);
        // Offline fallback: use cached count
        const offlineCount = cached.date === todayLocal ? cached.count : 0;
        return { canScan: offlineCount < PREMIUM_DAILY_LIMIT, count: offlineCount };
      }

      const scanCount = data?.scanCount || 0;
      const canScan = data?.canScan !== false;
      
      // Update cache
      setCachedPremiumScanCount(scanCount, todayLocal);

      return { canScan, count: scanCount };
    } catch (e) {
      console.warn("Error checking premium scan limit:", e);
      // Offline fallback
      const offlineCount = cached.date === todayLocal ? cached.count : 0;
      return { canScan: offlineCount < PREMIUM_DAILY_LIMIT, count: offlineCount };
    }
  }, []);

  // Consume a premium scan (increment server-side count)
  const consumePremiumScan = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("check-premium-scan", {
        body: {
          action: "consume",
          timezoneOffset: getTimezoneOffset(),
        },
      });

      if (error) {
        console.warn("Failed to consume premium scan:", error);
        // Optimistically update local cache
        const cached = getCachedPremiumScanCount();
        const todayLocal = getLocalDateString();
        const newCount = (cached.date === todayLocal ? cached.count : 0) + 1;
        setCachedPremiumScanCount(newCount, todayLocal);
        return true;
      }

      if (data?.limitReached && !data?.success) {
        // Limit reached - show friendly message
        toast.info("You've scanned a lot today. Please try again tomorrow.");
        return false;
      }

      // Update cache with new count
      const newCount = data?.scanCount || 1;
      setCachedPremiumScanCount(newCount, getLocalDateString());
      
      // Check if limit is now reached
      if (data?.limitReached) {
        setState(prev => ({ ...prev, premiumDailyLimitReached: true }));
      }

      return true;
    } catch (e) {
      console.warn("Error consuming premium scan:", e);
      // Optimistically allow on error
      return true;
    }
  }, []);

  // Mark device free scan as used (both backend and local)
  const markDeviceFreeScanUsed = useCallback(async () => {
    if (isAdmin) return;

    setLocalScanStatus(true);
    
    setState((prev) => ({
      ...prev,
      deviceFreeScanUsed: true,
      canScan: prev.isPremium && !prev.premiumDailyLimitReached,
    }));

    const deviceId = deviceIdRef.current || await getOrCreateDeviceId();
    
    supabase.functions.invoke("check-device-scan", {
      body: {
        deviceId,
        action: "consume",
        platform: getPlatform(),
      },
    }).then(() => {
      console.log("Device free scan consumed in backend");
    }).catch((e) => {
      console.warn("Failed to consume device scan in backend:", e);
    });
  }, [isAdmin]);

  // Check premium status from database (web fallback only)
  const checkDatabasePremium = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from("user_limits")
        .select("is_premium")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        return false;
      }

      return data.is_premium === true;
    } catch {
      return false;
    }
  }, []);

  // Sync premium status to database (for cross-platform sync)
  const syncPremiumToDatabase = useCallback(async (isPremium: boolean) => {
    if (!user?.id) return;

    try {
      await supabase.from("user_limits").upsert(
        {
          user_id: user.id,
          is_premium: isPremium,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch (e) {
      console.warn("Failed to sync premium status to database:", e);
    }
  }, [user?.id]);

  // Initialize and refresh state - debounced to prevent rapid re-init
  const initRunningRef = useRef(false);
  
  useEffect(() => {
    if (initRunningRef.current) return;

    const init = async () => {
      initRunningRef.current = true;
      try {
        const deviceUsed = await checkDeviceFreeScan();
        let premium = false;
        let dailyLimitReached = false;

        // CRITICAL: On iOS, RevenueCat is the ONLY source of truth
        if (isIOSNative()) {
          // Wait for RevenueCat to be ready
          if (revenueCatContext.isInitialized && !revenueCatContext.isLoading) {
            premium = revenueCatContext.isPro;
            
            // Sync to database for cross-platform
            if (premium && user?.id) {
              syncPremiumToDatabase(true);
            }
          } else {
            // RevenueCat still loading, use cached status temporarily
            premium = false;
          }
        } else if (user?.id) {
          // Web: check database
          premium = await checkDatabasePremium(user.id);
        }

        // Admin users are always premium with no limits
        if (isAdmin) {
          premium = true;
          dailyLimitReached = false;
        } else if (premium) {
          // Check premium daily limit
          const limitCheck = await checkPremiumDailyLimit();
          dailyLimitReached = !limitCheck.canScan;
        }

        const canScan = isAdmin || (premium && !dailyLimitReached) || (!premium && !deviceUsed);

        setState({
          isPremium: premium,
          deviceFreeScanUsed: deviceUsed,
          canScan,
          loading: false,
          premiumDailyLimitReached: dailyLimitReached,
        });
      } catch (e) {
        console.error("Failed to initialize scan limits:", e);
        const localUsed = getLocalScanStatus();
        setState({
          isPremium: false,
          deviceFreeScanUsed: localUsed,
          canScan: !localUsed,
          loading: false,
          premiumDailyLimitReached: false,
        });
      } finally {
        initRunningRef.current = false;
      }
    };

    init();
    
    // Only re-run on meaningful changes
  }, [user?.id, isAdmin, revenueCatContext.isInitialized, revenueCatContext.isPro]);

  // Update premium status when RevenueCat context changes (iOS)
  useEffect(() => {
    if (!isIOSNative()) return;
    
    if (revenueCatContext.isInitialized && !revenueCatContext.isLoading) {
      const premium = isAdmin || revenueCatContext.isPro;
      
      // If became premium, check daily limit
      if (premium && !isAdmin) {
        checkPremiumDailyLimit().then(({ canScan }) => {
          setState((prev) => ({
            ...prev,
            isPremium: premium,
            premiumDailyLimitReached: !canScan,
            canScan: canScan || !prev.deviceFreeScanUsed,
            loading: false,
          }));
        });
      } else {
        setState((prev) => ({
          ...prev,
          isPremium: premium,
          premiumDailyLimitReached: false,
          canScan: premium || !prev.deviceFreeScanUsed,
          loading: false,
        }));
      }
      
      // Sync to database
      if (revenueCatContext.isPro && user?.id) {
        syncPremiumToDatabase(true);
      }
    }
  }, [revenueCatContext.isPro, revenueCatContext.isInitialized, revenueCatContext.isLoading, isAdmin, user?.id, syncPremiumToDatabase, checkPremiumDailyLimit]);

  // Attempt to scan (camera) - returns true if allowed (PREMIUM ONLY)
  const attemptScan = useCallback((): boolean => {
    if (isAdmin) return true;
    
    if (state.isPremium) {
      if (state.premiumDailyLimitReached) {
        toast.info("You've scanned a lot today. Please try again tomorrow.");
        return false;
      }
      return true;
    }
    
    // Not premium - always block
    return false;
  }, [isAdmin, state.isPremium, state.premiumDailyLimitReached]);

  // Attempt describe food - returns true if allowed (premium only)
  const attemptDescribe = useCallback((): boolean => {
    if (isAdmin) return true;
    
    if (state.isPremium) {
      // Premium user - check daily limit
      if (state.premiumDailyLimitReached) {
        toast.info("You've scanned a lot today. Please try again tomorrow.");
        return false;
      }
      return true;
    }
    
    return false;
  }, [isAdmin, state.isPremium, state.premiumDailyLimitReached]);

  // Call this after a successful scan to consume the free scan or premium daily scan
  const consumeFreeScan = useCallback(async () => {
    if (isAdmin) return;
    
    if (state.isPremium) {
      // Premium user - consume from daily limit
      const success = await consumePremiumScan();
      if (!success) {
        setState(prev => ({ ...prev, premiumDailyLimitReached: true, canScan: false }));
      }
    } else if (!state.deviceFreeScanUsed) {
      // Non-premium user - consume device free scan
      markDeviceFreeScanUsed();
    }
  }, [isAdmin, state.isPremium, state.deviceFreeScanUsed, consumePremiumScan, markDeviceFreeScanUsed]);

  // Set premium status - ONLY for web platform
  // On iOS, RevenueCat is the SOLE source of truth - this function is a no-op
  const setPremium = useCallback(async (isPremium: boolean) => {
    // CRITICAL: On iOS, do NOT allow manual premium setting
    // RevenueCat entitlement is the only authority
    if (isIOSNative()) {
      console.warn("setPremium called on iOS - ignoring (RevenueCat is source of truth)");
      return;
    }

    // Web only: update local state and sync to database
    let dailyLimitReached = false;
    if (isPremium && !isAdmin) {
      const limitCheck = await checkPremiumDailyLimit();
      dailyLimitReached = !limitCheck.canScan;
    }

    setState((prev) => ({
      ...prev,
      isPremium,
      premiumDailyLimitReached: dailyLimitReached,
      canScan: isPremium ? !dailyLimitReached : !prev.deviceFreeScanUsed,
    }));

    if (user?.id) {
      await syncPremiumToDatabase(isPremium);
    }
  }, [user?.id, syncPremiumToDatabase, checkPremiumDailyLimit, isAdmin]);

  // Revalidate premium scan count (call when coming online)
  const revalidatePremiumLimit = useCallback(async () => {
    if (!state.isPremium || isAdmin) return;

    const { canScan } = await checkPremiumDailyLimit();
    setState(prev => ({
      ...prev,
      premiumDailyLimitReached: !canScan,
      canScan: canScan,
    }));
  }, [state.isPremium, isAdmin, checkPremiumDailyLimit]);

  return {
    ...state,
    attemptScan,
    attemptDescribe,
    consumeFreeScan,
    setPremium,
    markDeviceFreeScanUsed,
    revalidatePremiumLimit,
    isAdmin,
  };
}
