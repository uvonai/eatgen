/**
 * RevenueCat Debug Hook
 * 
 * DEVELOPMENT ONLY - for testing the paywall flow
 * 
 * This hook exposes detailed RevenueCat state for verification
 * during testing. It should NOT be used in production UI.
 * 
 * Usage in console (dev mode):
 * window.__REVENUECAT_DEBUG__ 
 */

import { useEffect, useCallback } from "react";
import { useRevenueCatContext } from "@/components/RevenueCatProvider";
import { useScanLimit } from "@/hooks/useScanLimit";
import {
  isIOSNative,
  isRevenueCatReady,
  getCachedProStatus,
  getCustomerInfo,
  getDefaultOffering,
  getSubscriptionStatus,
} from "@/lib/revenuecat";

interface DebugState {
  // Platform
  isIOS: boolean;
  isReady: boolean;
  
  // Context state
  isPro: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  proExpired: boolean;
  
  // Scan limits
  deviceFreeScanUsed: boolean;
  canScan: boolean;
  scanLimitLoading: boolean;
  
  // Cached state
  cachedProStatus: boolean;
}

export function useRevenueCatDebug() {
  const context = useRevenueCatContext();
  const scanLimit = useScanLimit();

  // Build current debug state
  const getDebugState = useCallback((): DebugState => ({
    // Platform
    isIOS: isIOSNative(),
    isReady: isRevenueCatReady(),
    
    // Context state
    isPro: context.isPro,
    isInitialized: context.isInitialized,
    isLoading: context.isLoading,
    isRefreshing: context.isRefreshing,
    proExpired: context.proExpired,
    
    // Scan limits
    deviceFreeScanUsed: scanLimit.deviceFreeScanUsed,
    canScan: scanLimit.canScan,
    scanLimitLoading: scanLimit.loading,
    
    // Cached state
    cachedProStatus: getCachedProStatus(),
  }), [context, scanLimit]);

  // Fetch full customer info (async)
  const fetchFullState = useCallback(async () => {
    if (!isIOSNative()) {
      console.log("RevenueCat Debug: Not on iOS native platform");
      return null;
    }

    const [customerInfo, offering, subscriptionStatus] = await Promise.all([
      getCustomerInfo(),
      getDefaultOffering(),
      getSubscriptionStatus(),
    ]);

    return {
      customerInfo,
      offering: offering ? {
        id: offering.identifier,
        packages: offering.availablePackages.map(p => ({
          id: p.identifier,
          productId: p.product.identifier,
          price: p.product.priceString,
        })),
        hasMonthly: !!offering.monthly,
        hasAnnual: !!offering.annual,
      } : null,
      subscriptionStatus,
      entitlements: customerInfo?.entitlements || null,
      proEntitlement: customerInfo?.entitlements.active["pro"] || null,
    };
  }, []);

  // Print test checklist
  const printTestChecklist = useCallback(() => {
    const state = getDebugState();
    
    console.group("🧪 RevenueCat Paywall Test Checklist");
    
    console.log("━━━ Platform ━━━");
    console.log(`iOS Native: ${state.isIOS ? "✅" : "❌"}`);
    console.log(`RevenueCat Ready: ${state.isReady ? "✅" : "❌"}`);
    
    console.log("\n━━━ 1. Initial State ━━━");
    console.log(`Initialized: ${state.isInitialized ? "✅" : "⏳"}`);
    console.log(`isPro (should be false for fresh user): ${state.isPro ? "⚠️ PRO" : "✅ NOT PRO"}`);
    console.log(`Device free scan used: ${state.deviceFreeScanUsed ? "YES" : "NO"}`);
    console.log(`Can scan: ${state.canScan ? "✅" : "❌"}`);
    
    console.log("\n━━━ 2. Paywall Ready ━━━");
    console.log(`Offerings will load when paywall opens`);
    
    console.log("\n━━━ 7. App Restart ━━━");
    console.log(`Context re-initializes on mount: ${state.isInitialized ? "✅" : "⏳"}`);
    
    console.log("\n━━━ 8. Subscription Expiry ━━━");
    console.log(`proExpired flag: ${state.proExpired ? "🚨 EXPIRED" : "✅ Not expired"}`);
    
    console.log("\n━━━ 9. Foreground/Background ━━━");
    console.log(`isRefreshing: ${state.isRefreshing ? "🔄 Refreshing..." : "Idle"}`);
    
    console.log("\n━━━ Raw State ━━━");
    console.log(state);
    
    console.groupEnd();
    
    return state;
  }, [getDebugState]);

  // Expose to window in development
  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as any).__REVENUECAT_DEBUG__ = {
        getState: getDebugState,
        fetchFullState,
        printChecklist: printTestChecklist,
        context,
        scanLimit,
      };
      
      console.log("🛠️ RevenueCat debug tools available: window.__REVENUECAT_DEBUG__");
      console.log("   - .getState()       → Current state snapshot");
      console.log("   - .fetchFullState() → Async full customer info");
      console.log("   - .printChecklist() → Print test verification");
    }

    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__REVENUECAT_DEBUG__;
      }
    };
  }, [getDebugState, fetchFullState, printTestChecklist, context, scanLimit]);

  return {
    getDebugState,
    fetchFullState,
    printTestChecklist,
  };
}
