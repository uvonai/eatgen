/**
 * RevenueCat Provider Component
 * 
 * PRODUCTION-GRADE IMPLEMENTATION
 * 
 * Responsibilities:
 * 1. Initialize RevenueCat on every app launch
 * 2. Handle user login/logout sync
 * 3. Refresh entitlements on app foreground/resume
 * 4. Provide entitlement state via context
 * 5. Handle offline behavior with temporary cache
 * 
 * CRITICAL: RevenueCat is the ONLY source of truth for entitlements
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  initializeRevenueCat,
  loginUser,
  logoutUser,
  isIOSNative,
  refreshCustomerInfo,
  getCachedProStatus,
  setEntitlementChangeCallback,
  cleanupRevenueCat,
  type CustomerInfo,
} from "@/lib/revenuecat";

interface RevenueCatContextValue {
  isPro: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  isRefreshing: boolean; // Loading indicator for foreground entitlement refresh
  proExpired: boolean; // True when user WAS pro but entitlement expired/revoked
  refreshEntitlements: () => Promise<boolean>;
  clearProExpired: () => void; // Call when paywall is shown to reset the flag
}

const RevenueCatContext = createContext<RevenueCatContextValue>({
  isPro: false,
  isInitialized: false,
  isLoading: true,
  isRefreshing: false,
  proExpired: false,
  refreshEntitlements: async () => false,
  clearProExpired: () => {},
});

export function useRevenueCatContext() {
  return useContext(RevenueCatContext);
}

export function RevenueCatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const [isPro, setIsPro] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // Loading indicator for foreground refresh
  const [proExpired, setProExpired] = useState(false); // Track when pro expires
  
  const initializedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const appStateListenerRef = useRef<any>(null);
  const wasProRef = useRef(false); // Track previous pro status to detect expiration

  // Clear the proExpired flag (call when paywall is shown)
  const clearProExpired = useCallback(() => {
    setProExpired(false);
  }, []);

  // Update isPro and detect expiration
  const updateProStatus = useCallback((newProStatus: boolean) => {
    // CRITICAL: Detect when user LOSES pro status (expiration/revocation)
    if (wasProRef.current && !newProStatus) {
      console.log("RevenueCat: Pro entitlement EXPIRED or REVOKED");
      setProExpired(true);
    }
    
    wasProRef.current = newProStatus;
    setIsPro(newProStatus);
  }, []);

  // Refresh entitlements from RevenueCat with loading indicator
  const refreshEntitlements = useCallback(async (): Promise<boolean> => {
    if (!isIOSNative()) return false;
    
    setIsRefreshing(true);
    try {
      const { isPro: proStatus } = await refreshCustomerInfo();
      updateProStatus(proStatus);
      return proStatus;
    } catch (error) {
      console.error("RevenueCat: Failed to refresh entitlements", error);
      // Keep current state on error
      return isPro;
    } finally {
      setIsRefreshing(false);
    }
  }, [isPro, updateProStatus]);

  // Handle entitlement changes (from RevenueCat listener - real-time updates)
  const handleEntitlementChange = useCallback((proStatus: boolean, _customerInfo: CustomerInfo) => {
    console.log("RevenueCat: Entitlement changed via listener, isPro:", proStatus);
    updateProStatus(proStatus);
  }, [updateProStatus]);

  // Initialize RevenueCat on iOS native platform
  useEffect(() => {
    if (!isIOSNative()) {
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }

    const init = async () => {
      if (initializedRef.current) {
        // Already initialized - just handle user changes
        const currentUserId = user?.id || null;
        
        if (currentUserId !== lastUserIdRef.current) {
          setIsLoading(true);
          
          if (currentUserId && !lastUserIdRef.current) {
            // User logged in
            console.log("RevenueCat: User logged in, syncing...");
            const customerInfo = await loginUser(currentUserId);
            if (customerInfo) {
              const proStatus = customerInfo.entitlements.active["pro"]?.isActive === true;
              updateProStatus(proStatus);
            }
          } else if (!currentUserId && lastUserIdRef.current) {
            // User logged out - logout from RevenueCat but preserve purchases
            console.log("RevenueCat: User logged out");
            const customerInfo = await logoutUser();
            if (customerInfo) {
              const proStatus = customerInfo.entitlements.active["pro"]?.isActive === true;
              // Don't trigger proExpired on logout - reset the tracker
              wasProRef.current = false;
              setIsPro(proStatus);
            }
          } else if (currentUserId && lastUserIdRef.current && currentUserId !== lastUserIdRef.current) {
            // User switched accounts
            console.log("RevenueCat: User switched, re-syncing...");
            const customerInfo = await loginUser(currentUserId);
            if (customerInfo) {
              const proStatus = customerInfo.entitlements.active["pro"]?.isActive === true;
              // Reset tracker for new user
              wasProRef.current = proStatus;
              setIsPro(proStatus);
            }
          }
          
          lastUserIdRef.current = currentUserId;
          setIsLoading(false);
        }
        return;
      }

      // First time initialization
      console.log("RevenueCat: Initializing...");
      setIsLoading(true);

      // Set up entitlement change callback
      setEntitlementChangeCallback(handleEntitlementChange);

      const success = await initializeRevenueCat(user?.id);
      
      if (success) {
        initializedRef.current = true;
        lastUserIdRef.current = user?.id || null;
        
        // Get initial pro status from cache (already fetched during init)
        const proStatus = getCachedProStatus();
        wasProRef.current = proStatus; // Initialize tracker
        setIsPro(proStatus);
        setIsInitialized(true);
        
        console.log("RevenueCat: Ready, isPro:", proStatus);
      } else {
        console.error("RevenueCat: Failed to initialize");
        setIsInitialized(false);
      }
      
      setIsLoading(false);
    };

    init();

    return () => {
      cleanupRevenueCat();
    };
  }, [user?.id, handleEntitlementChange]);

  // Handle app foreground/resume - refresh entitlements with debounce
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let lastForegroundTime = 0;
    const FOREGROUND_DEBOUNCE_MS = 5000; // Prevent rapid refresh on quick app switches

    const setupAppStateListener = async () => {
      try {
        // Listen for app state changes
        appStateListenerRef.current = await CapacitorApp.addListener(
          "appStateChange",
          async ({ isActive }) => {
            if (isActive && initializedRef.current) {
              const now = Date.now();
              
              // Debounce rapid foreground events (e.g., quick app switches)
              if (now - lastForegroundTime < FOREGROUND_DEBOUNCE_MS) {
                console.log("RevenueCat: Foreground debounced, skipping refresh");
                return;
              }
              
              lastForegroundTime = now;
              
              // App came to foreground - refresh entitlements
              console.log("RevenueCat: App foregrounded, refreshing entitlements...");
              await refreshEntitlements();
            }
          }
        );
      } catch (error) {
        console.error("RevenueCat: Failed to setup app state listener", error);
      }
    };

    setupAppStateListener();

    return () => {
      if (appStateListenerRef.current?.remove) {
        appStateListenerRef.current.remove();
      }
    };
  }, [refreshEntitlements]);

  const value: RevenueCatContextValue = {
    isPro,
    isInitialized,
    isLoading,
    isRefreshing,
    proExpired,
    refreshEntitlements,
    clearProExpired,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}
