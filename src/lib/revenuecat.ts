/**
 * RevenueCat iOS In-App Purchases Integration
 * 
 * PRODUCTION-GRADE IMPLEMENTATION
 * 
 * Core principles:
 * - RevenueCat is the ONLY source of truth for entitlements
 * - Never rely on local flags, cached booleans, or manual state
 * - Never unlock features unless RevenueCat confirms entitlement
 * - Always re-fetch customerInfo after purchases/restores
 * 
 * IMPORTANT: iOS ONLY - No Android logic included
 */

import { Capacitor } from "@capacitor/core";

// RevenueCat identifiers (must match your RevenueCat dashboard)
const ENTITLEMENT_ID = "pro";
const OFFERING_ID = "default";

// RevenueCat iOS API Key
// This is a public key safe to embed in iOS apps
const REVENUECAT_IOS_API_KEY = "appl_qzLQshiISPaWDLEQWFXayOSGPIf";

// Types for RevenueCat responses
export interface CustomerInfo {
  entitlements: {
    active: Record<string, EntitlementInfo>;
    all: Record<string, EntitlementInfo>;
  };
  activeSubscriptions: string[];
  originalAppUserId: string;
}

export interface EntitlementInfo {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  periodType: string;
  latestPurchaseDate: string;
  originalPurchaseDate: string;
  expirationDate: string | null;
  store: string;
  productIdentifier: string;
  isSandbox: boolean;
}

export interface Package {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    priceString: string;
    price: number;
    currencyCode: string;
  };
  offeringIdentifier: string;
}

export interface Offering {
  identifier: string;
  serverDescription: string;
  availablePackages: Package[];
  monthly?: Package;
  annual?: Package;
  lifetime?: Package;
}

export interface PurchasesOfferings {
  current: Offering | null;
  all: Record<string, Offering>;
}

// Module state
let isInitialized = false;
let PurchasesModule: any = null;
let purchaseInProgress = false; // Prevent duplicate purchase calls
let restoreInProgress = false; // Prevent duplicate restore calls
let lastKnownCustomerInfo: CustomerInfo | null = null; // Offline fallback cache
let initializationAttempts = 0; // Track retry attempts
const MAX_INIT_RETRIES = 3;

// Listener cleanup function
let customerInfoListenerRemove: (() => void) | null = null;

// Callback for entitlement changes
type EntitlementChangeCallback = (isPro: boolean, customerInfo: CustomerInfo) => void;
let entitlementChangeCallback: EntitlementChangeCallback | null = null;

/**
 * Check if we're running on iOS native platform
 */
export function isIOSNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/**
 * Set callback for entitlement changes (for real-time updates)
 */
export function setEntitlementChangeCallback(callback: EntitlementChangeCallback | null): void {
  entitlementChangeCallback = callback;
}

/**
 * Extract pro entitlement status from customerInfo
 * This is the ONLY way to determine premium access
 */
function extractProStatus(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  const proEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
  return proEntitlement?.isActive === true;
}

/**
 * Initialize RevenueCat SDK
 * Should be called once on every app launch (iOS only)
 * Uses anonymous user by default, call loginUser() when user authenticates
 */
export async function initializeRevenueCat(userId?: string): Promise<boolean> {
  if (!isIOSNative()) {
    console.log("RevenueCat: Skipping initialization (not iOS native)");
    return false;
  }

  if (isInitialized && PurchasesModule) {
    console.log("RevenueCat: Already initialized");
    return true;
  }

  // Retry logic for network failures
  while (initializationAttempts < MAX_INIT_RETRIES) {
    initializationAttempts++;
    
    try {
      // Dynamic import to prevent web build issues
      const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
      PurchasesModule = Purchases;

      // Configure RevenueCat with anonymous user by default
      await Purchases.configure({
        apiKey: REVENUECAT_IOS_API_KEY,
        appUserID: userId || null, // null = anonymous user
      });

      // Enable debug logging in development
      if (import.meta.env.DEV) {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      }

      // Set up customer info listener for real-time entitlement updates
      // This handles expiration, refunds, billing failures automatically
      await setupCustomerInfoListener();

      // Fetch initial customer info with timeout
      const customerInfoPromise = Purchases.getCustomerInfo();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("getCustomerInfo timeout")), 15000)
      );
      
      const { customerInfo } = await Promise.race([customerInfoPromise, timeoutPromise]);
      lastKnownCustomerInfo = customerInfo;

      isInitialized = true;
      initializationAttempts = 0; // Reset for next launch
      console.log("RevenueCat: Initialized successfully, isPro:", extractProStatus(customerInfo));
      
      return true;
    } catch (error) {
      console.error(`RevenueCat: Init attempt ${initializationAttempts}/${MAX_INIT_RETRIES} failed`, error);
      
      if (initializationAttempts < MAX_INIT_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, initializationAttempts - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error("RevenueCat: All initialization attempts failed");
  initializationAttempts = 0; // Reset for potential future retry
  return false;
}

/**
 * Set up listener for customer info changes
 * Handles: subscription renewals, expirations, refunds, billing failures
 */
async function setupCustomerInfoListener(): Promise<void> {
  if (!PurchasesModule) return;

  try {
    // Remove existing listener if any
    if (customerInfoListenerRemove) {
      customerInfoListenerRemove();
      customerInfoListenerRemove = null;
    }

    // Add new listener
    const result = await PurchasesModule.addCustomerInfoUpdateListener(
      (customerInfo: CustomerInfo) => {
        console.log("RevenueCat: Customer info updated");
        lastKnownCustomerInfo = customerInfo;
        
        const isPro = extractProStatus(customerInfo);
        
        // Notify callback of entitlement change
        if (entitlementChangeCallback) {
          entitlementChangeCallback(isPro, customerInfo);
        }
      }
    );

    customerInfoListenerRemove = result?.remove || null;
  } catch (error) {
    console.error("RevenueCat: Failed to setup listener", error);
  }
}

/**
 * Log in a user to RevenueCat
 * Call when user authenticates to sync their purchases across devices
 * 
 * IMPORTANT: This preserves purchase history - purchases are transferred to the new user ID
 */
export async function loginUser(userId: string): Promise<CustomerInfo | null> {
  if (!isIOSNative() || !PurchasesModule) {
    return null;
  }

  try {
    const { customerInfo } = await PurchasesModule.logIn({ appUserID: userId });
    lastKnownCustomerInfo = customerInfo;
    console.log("RevenueCat: User logged in, isPro:", extractProStatus(customerInfo));
    return customerInfo;
  } catch (error) {
    console.error("RevenueCat: Failed to login user", error);
    return null;
  }
}

/**
 * Log out user from RevenueCat
 * Resets to anonymous user but purchase history is preserved on RevenueCat servers
 */
export async function logoutUser(): Promise<CustomerInfo | null> {
  if (!isIOSNative() || !PurchasesModule) {
    return null;
  }

  try {
    const { customerInfo } = await PurchasesModule.logOut();
    lastKnownCustomerInfo = customerInfo;
    console.log("RevenueCat: User logged out, now anonymous");
    return customerInfo;
  } catch (error) {
    console.error("RevenueCat: Failed to logout user", error);
    return null;
  }
}

/**
 * Get current customer info (entitlements, subscriptions)
 * Always fetches fresh data from RevenueCat
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isIOSNative() || !PurchasesModule) {
    return null;
  }

  try {
    const { customerInfo } = await PurchasesModule.getCustomerInfo();
    lastKnownCustomerInfo = customerInfo;
    return customerInfo;
  } catch (error) {
    console.error("RevenueCat: Failed to get customer info", error);
    // Return last known info for offline fallback (temporary only)
    return lastKnownCustomerInfo;
  }
}

/**
 * Check if user has active "pro" entitlement
 * This is the AUTHORITATIVE check - always use this for access control
 * 
 * @param useCache - If true, may return cached value when offline
 */
export async function hasProEntitlement(useCache = false): Promise<boolean> {
  if (!isIOSNative()) {
    return false;
  }

  // If using cache and we have it, return immediately (offline fallback)
  if (useCache && lastKnownCustomerInfo) {
    return extractProStatus(lastKnownCustomerInfo);
  }

  const customerInfo = await getCustomerInfo();
  return extractProStatus(customerInfo);
}

/**
 * Get last known pro status without network call
 * ONLY use for temporary offline fallback - always revalidate when online
 */
export function getCachedProStatus(): boolean {
  return extractProStatus(lastKnownCustomerInfo);
}

/**
 * Get available offerings for display in paywall
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!isIOSNative() || !PurchasesModule) {
    return null;
  }

  try {
    const offerings = await PurchasesModule.getOfferings();
    return offerings;
  } catch (error) {
    console.error("RevenueCat: Failed to get offerings", error);
    return null;
  }
}

/**
 * Get the default offering with monthly and yearly packages
 */
export async function getDefaultOffering(): Promise<Offering | null> {
  const offerings = await getOfferings();
  if (!offerings) {
    return null;
  }

  const defaultOffering = offerings.all[OFFERING_ID] || offerings.current;
  return defaultOffering || null;
}

/**
 * Purchase a package (handles the entire Apple purchase flow)
 * 
 * PRODUCTION-GRADE IMPLEMENTATION:
 * - Prevents duplicate/parallel purchase calls
 * - Always re-fetches customerInfo after purchase
 * - Only returns success if entitlement is verified active
 */
export async function purchasePackage(pkg: Package): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  userCancelled?: boolean;
}> {
  if (!isIOSNative() || !PurchasesModule) {
    return { success: false, error: "RevenueCat not available" };
  }

  // Prevent duplicate purchase calls
  if (purchaseInProgress) {
    console.warn("RevenueCat: Purchase already in progress, ignoring duplicate call");
    return { success: false, error: "Purchase already in progress" };
  }

  purchaseInProgress = true;

  try {
    const { customerInfo } = await PurchasesModule.purchasePackage({
      aPackage: pkg,
    });

    // Update cache
    lastKnownCustomerInfo = customerInfo;

    // CRITICAL: Verify entitlement is actually active
    // Do NOT assume purchase success = entitlement active
    const isPro = extractProStatus(customerInfo);
    
    if (isPro) {
      console.log("RevenueCat: Purchase successful, pro entitlement verified active");
      return { success: true, customerInfo };
    } else {
      console.warn("RevenueCat: Purchase completed but pro entitlement not active");
      return { 
        success: false, 
        customerInfo,
        error: "Purchase did not grant pro access" 
      };
    }
  } catch (error: any) {
    // Check for user cancellation (not an error)
    const errorCode = error?.code;
    const errorMessage = error?.message || "";
    
    if (
      errorCode === 1 || 
      errorCode === "PURCHASE_CANCELLED" ||
      errorMessage.toLowerCase().includes("cancelled") ||
      errorMessage.toLowerCase().includes("canceled")
    ) {
      console.log("RevenueCat: Purchase cancelled by user");
      return { success: false, userCancelled: true };
    }

    // Handle other errors - keep previous entitlement state
    console.error("RevenueCat: Purchase failed", error);
    return { 
      success: false, 
      error: errorMessage || "Purchase failed" 
    };
  } finally {
    purchaseInProgress = false;
  }
}

/**
 * Restore purchases (required for App Store compliance)
 * 
 * After restore:
 * - Always re-fetches customerInfo
 * - Updates entitlement state strictly from RevenueCat response
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  isPro: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}> {
  if (!isIOSNative() || !PurchasesModule) {
    return { success: false, isPro: false, error: "RevenueCat not available" };
  }

  // Prevent duplicate restore calls
  if (restoreInProgress) {
    console.warn("RevenueCat: Restore already in progress, ignoring duplicate call");
    return { success: false, isPro: getCachedProStatus(), error: "Restore already in progress" };
  }

  restoreInProgress = true;

  try {
    // Add timeout to prevent hanging
    const restorePromise = PurchasesModule.restorePurchases();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Restore timeout - please try again")), 30000)
    );
    
    const { customerInfo } = await Promise.race([restorePromise, timeoutPromise]);
    
    // Update cache
    lastKnownCustomerInfo = customerInfo;
    
    // Check entitlement strictly from response
    const isPro = extractProStatus(customerInfo);
    
    console.log("RevenueCat: Restore complete, isPro:", isPro);
    return { success: true, isPro, customerInfo };
  } catch (error: any) {
    console.error("RevenueCat: Restore failed", error);
    return { 
      success: false, 
      isPro: getCachedProStatus(), // Keep previous state on error
      error: error?.message || "Restore failed" 
    };
  } finally {
    restoreInProgress = false;
  }
}

/**
 * Force refresh customer info from RevenueCat
 * Call this on app foreground/resume to catch:
 * - Subscription renewals
 * - Expirations
 * - Refunds
 * - Billing failures
 * - Subscription changes from outside the app
 */
export async function refreshCustomerInfo(): Promise<{
  isPro: boolean;
  customerInfo: CustomerInfo | null;
}> {
  const customerInfo = await getCustomerInfo();
  const isPro = extractProStatus(customerInfo);
  
  console.log("RevenueCat: Refreshed customer info, isPro:", isPro);
  
  return { isPro, customerInfo };
}

/**
 * Get subscription status details for display
 */
export async function getSubscriptionStatus(): Promise<{
  isPro: boolean;
  willRenew: boolean;
  expirationDate: string | null;
  productId: string | null;
  periodType: string | null;
} | null> {
  const customerInfo = await getCustomerInfo();
  if (!customerInfo) {
    return null;
  }

  const proEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
  if (!proEntitlement) {
    return {
      isPro: false,
      willRenew: false,
      expirationDate: null,
      productId: null,
      periodType: null,
    };
  }

  return {
    isPro: proEntitlement.isActive,
    willRenew: proEntitlement.willRenew,
    expirationDate: proEntitlement.expirationDate,
    productId: proEntitlement.productIdentifier,
    periodType: proEntitlement.periodType,
  };
}

/**
 * Check if RevenueCat is initialized and ready
 */
export function isRevenueCatReady(): boolean {
  return isIOSNative() && isInitialized && PurchasesModule !== null;
}

/**
 * Cleanup function - call on app teardown if needed
 */
export function cleanupRevenueCat(): void {
  if (customerInfoListenerRemove) {
    customerInfoListenerRemove();
    customerInfoListenerRemove = null;
  }
  entitlementChangeCallback = null;
}
