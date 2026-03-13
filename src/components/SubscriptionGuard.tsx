/**
 * Subscription Guard Component
 * 
 * PRODUCTION-GRADE IMPLEMENTATION
 * 
 * Monitors subscription expiration and automatically shows paywall when:
 * 1. Pro entitlement expires or is revoked
 * 2. User returns to app and entitlement check fails
 * 
 * CRITICAL: RevenueCat is the ONLY source of truth for entitlements
 * 
 * TESTING REQUIREMENTS MET:
 * - Requirement 8: Subscription Expiry - proExpired flag triggers paywall
 * - Requirement 9: Foreground/Background - handled by RevenueCatProvider
 */

import { useEffect, useState, useCallback } from "react";
import { useRevenueCatContext } from "@/components/RevenueCatProvider";
import { Paywall } from "@/components/Paywall";
import { toast } from "sonner";
import { isIOSNative } from "@/lib/revenuecat";
import { useRevenueCatDebug } from "@/hooks/useRevenueCatDebug";

export function SubscriptionGuard() {
  const { 
    isPro, 
    isInitialized, 
    proExpired, 
    clearProExpired,
    refreshEntitlements 
  } = useRevenueCatContext();
  
  const [showPaywall, setShowPaywall] = useState(false);

  // Mount debug hook in development for testing verification
  useRevenueCatDebug();

  // Log state changes for verification (dev only)
  useEffect(() => {
    if (import.meta.env.DEV && isIOSNative()) {
      console.log("[SubscriptionGuard] State:", {
        isPro,
        isInitialized,
        proExpired,
        showPaywall,
      });
    }
  }, [isPro, isInitialized, proExpired, showPaywall]);

  // Show paywall when pro expires (Requirement 8)
  useEffect(() => {
    if (!isIOSNative()) return;
    
    if (proExpired && isInitialized) {
      console.log("SubscriptionGuard: Pro expired, showing paywall");
      toast.error("Your subscription has expired");
      setShowPaywall(true);
      clearProExpired(); // Reset the flag after handling
    }
  }, [proExpired, isInitialized, clearProExpired]);

  // Handle paywall close
  const handlePaywallClose = useCallback(() => {
    setShowPaywall(false);
  }, []);

  // Handle successful resubscription
  const handleSubscribeSuccess = useCallback(async () => {
    // Refresh entitlements to confirm pro status
    await refreshEntitlements();
    setShowPaywall(false);
    toast.success("Welcome back to Eatgen Pro! 🎉");
  }, [refreshEntitlements]);

  // Only render on iOS native
  if (!isIOSNative()) {
    return null;
  }

  return (
    <Paywall
      isOpen={showPaywall}
      onClose={handlePaywallClose}
      onSubscribeSuccess={handleSubscribeSuccess}
    />
  );
}
