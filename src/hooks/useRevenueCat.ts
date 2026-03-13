/**
 * React hook for RevenueCat integration
 * 
 * PRODUCTION-GRADE IMPLEMENTATION
 * 
 * Provides:
 * - Access to RevenueCat context state
 * - Purchase and restore functionality with proper guards
 * - Subscription status details
 * - Price information from offerings
 * 
 * CRITICAL: 
 * - RevenueCat is the ONLY source of truth
 * - Never rely on local state for premium access
 * - Always verify entitlement after purchase/restore
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRevenueCatContext } from "@/components/RevenueCatProvider";
import {
  isIOSNative,
  getDefaultOffering,
  purchasePackage,
  restorePurchases,
  getSubscriptionStatus as getRevenueCatSubscriptionStatus,
  refreshCustomerInfo,
  type Offering,
  type Package,
} from "@/lib/revenuecat";

export interface SubscriptionStatus {
  isPro: boolean;
  planType: "monthly" | "yearly" | "lifetime" | null;
  expirationDate: Date | null;
  willRenew: boolean;
}

// Purchase/Restore transaction status
export type TransactionStatus = 
  | "idle"
  | "processing"
  | "success"
  | "cancelled"
  | "failed"
  | "pending";

// Transaction result with detailed information
export interface TransactionResult {
  status: TransactionStatus;
  message: string;
  isPro: boolean;
}

interface UseRevenueCatReturn {
  // State from context
  isPro: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  isRefreshing: boolean; // Loading indicator for foreground refresh
  proExpired: boolean; // True when pro entitlement was lost
  
  // Offerings and prices
  offering: Offering | null;
  subscriptionStatus: SubscriptionStatus | null;
  isIOSNative: boolean;
  
  // Transaction state
  transactionStatus: TransactionStatus;
  transactionMessage: string;
  
  // Actions
  purchase: (plan: "monthly" | "yearly") => Promise<TransactionResult>;
  restore: () => Promise<TransactionResult>;
  refreshEntitlements: () => Promise<boolean>;
  getPrices: () => { monthly: string; yearly: string; monthlyEquivalent: string };
  resetTransactionState: () => void;
  clearProExpired: () => void;
  
  // Loading states
  isPurchasing: boolean;
  isRestoring: boolean;
}

export function useRevenueCat(): UseRevenueCatReturn {
  const context = useRevenueCatContext();
  
  const [offering, setOffering] = useState<Offering | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [offeringLoaded, setOfferingLoaded] = useState(false);
  
  // Transaction state
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>("idle");
  const [transactionMessage, setTransactionMessage] = useState("");
  
  const loadingOfferingsRef = useRef(false);

  // Reset transaction state (call when paywall closes or user dismisses)
  const resetTransactionState = useCallback(() => {
    setTransactionStatus("idle");
    setTransactionMessage("");
  }, []);

  // Load offerings when initialized
  useEffect(() => {
    if (!isIOSNative() || !context.isInitialized || offeringLoaded || loadingOfferingsRef.current) {
      return;
    }

    const loadOfferings = async () => {
      loadingOfferingsRef.current = true;
      try {
        const defaultOffering = await getDefaultOffering();
        setOffering(defaultOffering);
        setOfferingLoaded(true);
      } catch (error) {
        console.error("useRevenueCat: Failed to load offerings", error);
      } finally {
        loadingOfferingsRef.current = false;
      }
    };

    loadOfferings();
  }, [context.isInitialized, offeringLoaded]);

  // Load subscription status when pro
  useEffect(() => {
    if (!isIOSNative() || !context.isInitialized) return;

    const loadStatus = async () => {
      if (context.isPro) {
        try {
          const status = await getRevenueCatSubscriptionStatus();
          if (status) {
            // Determine plan type from product ID
            let planType: "monthly" | "yearly" | "lifetime" | null = null;
            if (status.productId) {
              const productIdLower = status.productId.toLowerCase();
              if (productIdLower.includes("monthly") || productIdLower.includes("month")) {
                planType = "monthly";
              } else if (productIdLower.includes("yearly") || productIdLower.includes("annual") || productIdLower.includes("year")) {
                planType = "yearly";
              } else if (productIdLower.includes("lifetime")) {
                planType = "lifetime";
              }
            }

            setSubscriptionStatus({
              isPro: status.isPro,
              planType,
              expirationDate: status.expirationDate ? new Date(status.expirationDate) : null,
              willRenew: status.willRenew,
            });
          }
        } catch (error) {
          console.error("useRevenueCat: Failed to get subscription status", error);
        }
      } else {
        setSubscriptionStatus(null);
      }
    };

    loadStatus();
  }, [context.isPro, context.isInitialized]);

  // Purchase a plan with proper guards and detailed result handling
  const purchase = useCallback(
    async (plan: "monthly" | "yearly"): Promise<TransactionResult> => {
      // Default result for non-iOS
      if (!isIOSNative()) {
        console.log("useRevenueCat: Purchase not available (not iOS)");
        return { 
          status: "failed", 
          message: "Not available on this platform",
          isPro: false 
        };
      }

      if (!offering) {
        console.error("useRevenueCat: No offering available");
        return { 
          status: "failed", 
          message: "Offerings not loaded",
          isPro: false 
        };
      }

      // Prevent duplicate purchases
      if (isPurchasing) {
        console.warn("useRevenueCat: Purchase already in progress");
        return { 
          status: "processing", 
          message: "Purchase already in progress",
          isPro: context.isPro 
        };
      }

      setIsPurchasing(true);
      setTransactionStatus("processing");
      setTransactionMessage("Processing...");

      try {
        // Get the appropriate package
        const pkg: Package | undefined =
          plan === "monthly" ? offering.monthly : offering.annual;

        if (!pkg) {
          console.error("useRevenueCat: Package not found for plan:", plan);
          setTransactionStatus("failed");
          setTransactionMessage("Package not available");
          return { 
            status: "failed", 
            message: "Package not available",
            isPro: false 
          };
        }

        const result = await purchasePackage(pkg);

        // CRITICAL: Check entitlement from result - this is the ONLY source of truth
        if (result.success && result.customerInfo) {
          // Entitlement verified active by purchasePackage
          console.log("useRevenueCat: Purchase successful, pro entitlement active");
          
          // Force refresh to update context immediately
          await context.refreshEntitlements();
          
          setTransactionStatus("success");
          setTransactionMessage("🎉 You unlocked Eatgen Pro");
          
          return { 
            status: "success", 
            message: "🎉 You unlocked Eatgen Pro",
            isPro: true 
          };
        }

        // User cancelled - not an error
        if (result.userCancelled) {
          setTransactionStatus("cancelled");
          setTransactionMessage("Purchase cancelled. You were not charged.");
          return { 
            status: "cancelled", 
            message: "Purchase cancelled. You were not charged.",
            isPro: context.isPro 
          };
        }

        // Purchase completed but pro entitlement not yet active (pending)
        if (result.customerInfo && !result.success && !result.error) {
          setTransactionStatus("pending");
          setTransactionMessage("Purchase pending. Waiting for App Store approval.");
          return { 
            status: "pending", 
            message: "Purchase pending. Waiting for App Store approval.",
            isPro: false 
          };
        }

        // Error case
        setTransactionStatus("failed");
        setTransactionMessage(result.error || "Transaction failed. Please try again.");
        return { 
          status: "failed", 
          message: result.error || "Transaction failed. Please try again.",
          isPro: false 
        };
      } catch (error: any) {
        console.error("useRevenueCat: Purchase error", error);
        setTransactionStatus("failed");
        setTransactionMessage("Transaction failed. Please try again.");
        return { 
          status: "failed", 
          message: "Transaction failed. Please try again.",
          isPro: false 
        };
      } finally {
        setIsPurchasing(false);
      }
    },
    [offering, isPurchasing, context]
  );

  // Restore purchases with proper handling and detailed result
  const restore = useCallback(async (): Promise<TransactionResult> => {
    if (!isIOSNative()) {
      console.log("useRevenueCat: Restore not available (not iOS)");
      return { 
        status: "failed", 
        message: "Not available on this platform",
        isPro: false 
      };
    }

    if (isRestoring) {
      console.warn("useRevenueCat: Restore already in progress");
      return { 
        status: "processing", 
        message: "Restore already in progress",
        isPro: context.isPro 
      };
    }

    setIsRestoring(true);
    setTransactionStatus("processing");
    setTransactionMessage("Restoring purchases...");

    try {
      const result = await restorePurchases();

      if (result.success && result.isPro) {
        // Pro entitlement found and active
        await context.refreshEntitlements();
        
        setTransactionStatus("success");
        setTransactionMessage("Eatgen Pro restored");
        
        return { 
          status: "success", 
          message: "Eatgen Pro restored",
          isPro: true 
        };
      }

      if (result.success && !result.isPro) {
        // Restore completed but no pro entitlement
        setTransactionStatus("idle");
        setTransactionMessage("No active subscription found");
        
        return { 
          status: "idle", 
          message: "No active subscription found",
          isPro: false 
        };
      }

      // Error case
      setTransactionStatus("failed");
      setTransactionMessage(result.error || "Restore failed. Please try again.");
      return { 
        status: "failed", 
        message: result.error || "Restore failed. Please try again.",
        isPro: context.isPro 
      };
    } catch (error: any) {
      console.error("useRevenueCat: Restore error", error);
      setTransactionStatus("failed");
      setTransactionMessage("Restore failed. Please try again.");
      return { 
        status: "failed", 
        message: "Restore failed. Please try again.",
        isPro: context.isPro 
      };
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, context]);

  // Get price strings for display
  const getPrices = useCallback(() => {
    if (!offering) {
      // Fallback prices (will be overwritten by real prices)
      return {
        monthly: "$14.99",
        yearly: "$59.99",
        monthlyEquivalent: "$5.00",
      };
    }

    const monthlyPrice = offering.monthly?.product.priceString || "$14.99";
    const yearlyPrice = offering.annual?.product.priceString || "$59.99";
    
    // Calculate monthly equivalent for yearly
    const yearlyAmount = offering.annual?.product.price || 59.99;
    const monthlyEquivalent = `$${(yearlyAmount / 12).toFixed(2)}`;

    return {
      monthly: monthlyPrice,
      yearly: yearlyPrice,
      monthlyEquivalent,
    };
  }, [offering]);

  return {
    // State from context
    isPro: context.isPro,
    isInitialized: context.isInitialized,
    isLoading: context.isLoading,
    isRefreshing: context.isRefreshing,
    proExpired: context.proExpired,
    
    // Offerings
    offering,
    subscriptionStatus,
    isIOSNative: isIOSNative(),
    
    // Transaction state
    transactionStatus,
    transactionMessage,
    
    // Actions
    purchase,
    restore,
    refreshEntitlements: context.refreshEntitlements,
    getPrices,
    resetTransactionState,
    clearProExpired: context.clearProExpired,
    
    // Loading states
    isPurchasing,
    isRestoring,
  };
}
