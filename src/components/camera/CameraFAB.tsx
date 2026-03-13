import { useState, useRef, useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { CameraOptionsSheet } from "./CameraOptionsSheet";
import { CameraScanner } from "./CameraScanner";
import { DescribeFoodScanner } from "./DescribeFoodScanner";
import { Paywall } from "@/components/Paywall";
import { useScanLimit } from "@/hooks/useScanLimit";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { toast } from "sonner";
// Minimal modern camera icon - SF Symbols inspired
const CameraIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    className="w-6 h-6"
    fill="currentColor"
  >
    {/* Camera body - rounded rectangle */}
    <rect x="2" y="6" width="20" height="13" rx="3" fill="currentColor" />
    {/* Camera bump/viewfinder */}
    <path d="M7.5 6V5a1.5 1.5 0 011.5-1.5h6A1.5 1.5 0 0116.5 5v1" fill="currentColor" />
    {/* Lens - outer ring */}
    <circle cx="12" cy="12.5" r="4" fill="white" />
    {/* Lens - inner dark */}
    <circle cx="12" cy="12.5" r="2.5" fill="#1a1a1a" />
    {/* Lens reflection */}
    <circle cx="11" cy="11.5" r="0.8" fill="white" opacity="0.6" />
  </svg>
);

interface CameraFABProps {
  onMealSaved?: () => void;
  /** Function that refreshes all data and returns a Promise that resolves when data is ready */
  refreshDataAsync?: () => Promise<void>;
}

export const CameraFAB = ({ onMealSaved, refreshDataAsync }: CameraFABProps) => {
  const [showOptions, setShowOptions] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showDescribe, setShowDescribe] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [pendingOption, setPendingOption] = useState<"scan" | "describe" | null>(null);

  // Guards against double-taps opening multiple permission dialogs / scanners
  const requestingRef = useRef(false);

  const { canScan, attemptScan, attemptDescribe, consumeFreeScan, setPremium, revalidatePremiumLimit, loading } = useScanLimit();
  const { isPro, refreshEntitlements, isIOSNative, isInitialized } = useRevenueCat();
  const isOnline = useNetworkStatus();

  // Revalidate premium scan count when coming back online
  useEffect(() => {
    if (isOnline) {
      revalidatePremiumLimit();
    }
  }, [isOnline, revalidatePremiumLimit]);
  const handleFABClick = () => {
    // Show options sheet first, we'll check limits when they select an option
    setShowOptions(true);
  };

  const ensureNativeCameraPermission = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return true;

    try {
      const { Camera } = await import("@capacitor/camera");

      const current = await Camera.checkPermissions();
      if (current.camera === "granted" || current.camera === "limited") return true;

      const res = await Camera.requestPermissions({ permissions: ["camera"] });
      return res.camera === "granted" || res.camera === "limited";
    } catch (e) {
      console.warn("NATIVE_CAMERA_PREFLIGHT_ERROR (non-fatal):", e);
      return false;
    }
  }, []);

  const handleOptionSelect = useCallback(async (option: "scan" | "describe") => {
    // Prevent duplicate flows from fast taps
    if (requestingRef.current) return;
    requestingRef.current = true;

    try {
      setShowOptions(false);

      // Check RevenueCat entitlement first on iOS — only gate if RC is initialized
      const hasPro = isIOSNative ? (isPro || !isInitialized) : false;

      if (option === "scan") {
        // Camera scan: Premium only
        if (!hasPro && !attemptScan()) {
          setPendingOption(option);
          setShowPaywall(true);
          return;
        }

        // Request camera permission
        const ok = await ensureNativeCameraPermission();
        if (!ok) {
          toast.error("Camera access denied. Please enable it in Settings.");
          return;
        }
        setShowCamera(true);
        return;
      }

      if (option === "describe") {
        // Describe food: Premium only
        if (!hasPro && !attemptDescribe()) {
          setPendingOption(option);
          setShowPaywall(true);
          return;
        }
        setShowDescribe(true);
      }
    } finally {
      requestingRef.current = false;
    }
  }, [attemptScan, attemptDescribe, ensureNativeCameraPermission, isPro, isIOSNative]);

  const handleCameraClose = async (saved?: boolean) => {
    setShowCamera(false);
    if (saved) {
      // Consume the scan after successful save (handles both free and premium)
      await consumeFreeScan();
      if (onMealSaved) {
        onMealSaved();
      }
    }
  };
  const handleDescribeClose = async (saved?: boolean) => {
    setShowDescribe(false);
    if (saved) {
      // Consume the scan for premium users (tracked for fair-use)
      await consumeFreeScan();
      if (onMealSaved) {
        onMealSaved();
      }
    }
  };
  const handlePaywallClose = () => {
    setShowPaywall(false);
    setPendingOption(null);
  };

  const handleSubscribeSuccess = useCallback(async () => {
    // On iOS, refresh RevenueCat entitlements - this is the source of truth
    // The context will update and useScanLimit will pick up the new isPro status
    if (isIOSNative) {
      await refreshEntitlements();
    } else {
      // Web only: manually set premium (database backed)
      await setPremium(true);
    }

    setShowPaywall(false);

    // If user had a pending action, execute it
    const action = pendingOption;
    setPendingOption(null);

    if (action === "scan") {
      // Small delay to ensure state has propagated
      await new Promise((resolve) => setTimeout(resolve, 100));
      const ok = await ensureNativeCameraPermission();
      if (!ok) {
        toast.error("Camera access denied. Please enable it in Settings.");
        return;
      }
      setShowCamera(true);
    } else if (action === "describe") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      setShowDescribe(true);
    }
  }, [setPremium, pendingOption, ensureNativeCameraPermission, isIOSNative, refreshEntitlements]);

  return (
    <>
      {/* Floating Action Button with premium glow */}
      <button
        onClick={handleFABClick}
        disabled={loading}
        className="fixed z-50 w-14 h-14 rounded-full bg-white shadow-lg shadow-black/30 flex items-center justify-center text-black active:scale-90 hover:scale-105 transition-all duration-200 ease-out disabled:opacity-50 group"
        style={{
          right: "20px",
          bottom: "calc(90px + env(safe-area-inset-bottom))",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25), 0 0 40px rgba(255, 255, 255, 0.1)",
        }}
        aria-label="Open camera"
      >
        <CameraIcon />
      </button>

      {/* Options Sheet */}
      <CameraOptionsSheet 
        isOpen={showOptions} 
        onClose={() => setShowOptions(false)} 
        onSelectOption={handleOptionSelect}
      />

      {/* Camera Scanner */}
      {showCamera && <CameraScanner onClose={handleCameraClose} refreshDataAsync={refreshDataAsync} />}

      {/* Describe Food Scanner */}
      {showDescribe && <DescribeFoodScanner onClose={handleDescribeClose} refreshDataAsync={refreshDataAsync} />}

      {/* Paywall */}
      <Paywall
        isOpen={showPaywall}
        onClose={handlePaywallClose}
        onSubscribeSuccess={handleSubscribeSuccess}
      />
    </>
  );
};
