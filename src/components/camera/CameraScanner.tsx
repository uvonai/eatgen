import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { Camera, Settings, Images, X } from "lucide-react";

import { CameraPreview } from "./CameraPreview";
import { AnalyzingScreen } from "./AnalyzingScreen";
import { SavingScreen } from "./SavingScreen";
import { AnalysisResults } from "./AnalysisResults";
import { useNativeCamera } from "./useNativeCamera";
import { LiveCameraView } from "./LiveCameraView";
import { BarcodeScanner } from "./BarcodeScanner";

import { useFoodAnalysis, FoodAnalysis } from "@/hooks/useFoodAnalysis";
import { normalizePickedImageFile, urlToImageFile } from "@/lib/image-file";
import { compressImageToBase64 } from "@/lib/image-compress";
import { openNativeAppSettings } from "@/lib/native-settings";
import { supabase } from "@/integrations/supabase/client";
import { useOptimisticMeal } from "@/contexts/OptimisticMealContext";

interface CameraScannerProps {
  onClose: (saved?: boolean) => void;
  /** Function that refreshes all data and returns a Promise that resolves when data is ready */
  refreshDataAsync?: () => Promise<void>;
}

type CameraState = "camera" | "native-denied" | "barcode" | "preview" | "analyzing" | "results" | "saving";

// Track which component is currently active for proper cleanup
type ActiveComponent = "none" | "camera" | "barcode";

export const CameraScanner = ({ onClose, refreshDataAsync }: CameraScannerProps) => {
  const navigate = useNavigate();
  const { addPendingMeal, clearPendingMeal } = useOptimisticMeal();
  
  const [state, setState] = useState<CameraState>("camera");
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<FoodAnalysis | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [savingComplete, setSavingComplete] = useState(false);

  // Forces LiveCameraView to remount when we need a hard restart (e.g., gallery cancel)
  const [cameraInstanceKey, setCameraInstanceKey] = useState(0);
  
  // Transition overlay state - shows solid black during mode switches
  const [isTransitioning, setIsTransitioning] = useState(true); // Start with overlay visible
  const [activeComponent, setActiveComponent] = useState<ActiveComponent>("none");
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capturedFileRef = useRef<File | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const hasLaunchedNativeCameraRef = useRef(false);
  const mountedRef = useRef(true);
  const isGalleryOpenRef = useRef(false);

  const isNative = Capacitor.isNativePlatform();
  const nativeCamera = useNativeCamera();
  const foodAnalysis = useFoodAnalysis();

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Helper to switch modes with a black transition overlay
  // This ensures the overlay is shown BEFORE unmounting the current component
  const switchModeWithTransition = useCallback((newState: CameraState, delay = 50) => {
    // Show black overlay immediately
    setIsTransitioning(true);
    setActiveComponent("none");
    
    // Clear any pending timeout
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }
    
    // Switch state after a brief delay (ensures overlay is rendered and old component unmounted first)
    transitionTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setState(newState);
      }
    }, delay);
  }, []);

  // Signal that camera/barcode is ready - called by child components
  const onModeReady = useCallback((component: ActiveComponent = "camera") => {
    if (mountedRef.current) {
      console.log(`Mode ready: ${component}`);
      setActiveComponent(component);
      setIsTransitioning(false);
    }
  }, []);

  const clearCaptured = useCallback(() => {
    if (capturedPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    capturedFileRef.current = null;
    setCapturedPreviewUrl(null);
    setAnalysisData(null);
    setAnalysisReady(false);
  }, [capturedPreviewUrl]);

  const restartCameraMode = useCallback(() => {
    // Show overlay while the camera spins back up
    setIsTransitioning(true);
    setActiveComponent("none");

    // Ensure camera UI remounts so LiveCameraView reruns its startup logic + onReady
    setCameraInstanceKey((k) => k + 1);
    setState("camera");

    // Reset guards
    hasLaunchedNativeCameraRef.current = false;
  }, []);

  const showCaptureError = useCallback(
    (message: string, retry?: () => void) => {
      toast.error(message, retry ? { action: { label: "Retry", onClick: retry } } : undefined);
    },
    []
  );

  const setCapturedFile = useCallback(
    (file: File) => {
      const normalized = normalizePickedImageFile(file, "food.jpg");
      if (!normalized || normalized.size <= 0) {
        showCaptureError("Image not captured. Please try again.");
        return;
      }

      clearCaptured();
      capturedFileRef.current = normalized;
      setCapturedPreviewUrl(URL.createObjectURL(normalized));
      setIsTransitioning(false); // Ensure overlay is hidden
      setState("preview");
    },
    [clearCaptured, showCaptureError]
  );

  // Track if we need to restart camera after gallery cancel
  const needsCameraRestartRef = useRef(false);

  // Handle file from gallery input (web)
  const handleGalleryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.currentTarget.files?.[0];
      e.currentTarget.value = "";
      if (file) {
        needsCameraRestartRef.current = false;
        isGalleryOpenRef.current = false;
        setCapturedFile(file);
      } else {
        // User cancelled - hide overlay and restart camera if needed
        console.log("Gallery cancelled (change event)");
        needsCameraRestartRef.current = false;
        isGalleryOpenRef.current = false;
        restartCameraMode();
      }
    },
    [setCapturedFile, restartCameraMode]
  );

  const openGallery = useCallback(async () => {
    // Prevent multiple gallery opens
    if (isGalleryOpenRef.current) {
      console.log("Gallery already opening, ignoring...");
      return;
    }
    
    console.log("Opening gallery...");
    isGalleryOpenRef.current = true;
    needsCameraRestartRef.current = true; // Mark that camera needs restart if cancelled
    
    // Show black overlay immediately and mark no active component
    setIsTransitioning(true);
    setActiveComponent("none");
    
    if (isNative) {
      // Native: Use Capacitor Camera plugin for gallery picker
      try {
        const { Camera: CapacitorCamera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        
        // First request photos permission - this triggers the native system dialog
        console.log("Requesting gallery permissions...");
        const permResult = await CapacitorCamera.requestPermissions({ permissions: ["photos"] });
        console.log("Gallery permission result:", permResult);
        
        if (permResult.photos === "denied") {
          toast.error("Gallery access denied. Please enable it in Settings.");
          // Restart camera mode
          needsCameraRestartRef.current = false;
          isGalleryOpenRef.current = false;
          restartCameraMode();
          return;
        }
        
        // Small delay to ensure any active camera is fully released
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        console.log("Opening native gallery picker...");
        
        // Use getPhoto with Photos source - this opens the native gallery picker
        const photo = await CapacitorCamera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Photos,
          correctOrientation: true,
          presentationStyle: "popover",
        });
        
        console.log("Photo picked:", photo);
        
        const webPath = photo?.webPath;
        if (webPath) {
          try {
            const file = await urlToImageFile(webPath, "food.jpg");
            needsCameraRestartRef.current = false;
            isGalleryOpenRef.current = false;
            setCapturedFile(file);
          } catch (e) {
            console.warn("Couldn't load image (non-fatal):", e);
            showCaptureError("Couldn't load image. Please try again.");
            needsCameraRestartRef.current = false;
            isGalleryOpenRef.current = false;
            switchModeWithTransition("camera");
          }
        } else {
          // User cancelled gallery - restart camera
          console.log("Gallery cancelled - restarting camera");
          needsCameraRestartRef.current = false;
          isGalleryOpenRef.current = false;
          restartCameraMode();
        }
      } catch (e: any) {
        console.warn("Couldn't open gallery (non-fatal):", e);
        const message = e?.message?.toLowerCase() || "";
        
        // Check if user cancelled
        if (message.includes("cancel") || message.includes("user denied")) {
          console.log("User cancelled gallery selection - restarting camera");
        } else if (message.includes("denied") || message.includes("permission")) {
          toast.error("Gallery access denied. Please enable it in Settings.");
        } else {
          showCaptureError("Couldn't open gallery. Please try again.");
        }
        // Always restart camera on any error/cancel
        needsCameraRestartRef.current = false;
        isGalleryOpenRef.current = false;
        restartCameraMode();
      }
    } else {
      // Web: trigger file input with cancel detection
      try {
        const input = galleryInputRef.current;
        if (!input) {
          throw new Error("No file input");
        }
        
        // Detect cancel: when window regains focus and no file was selected
        const handleFocus = () => {
          // Small delay to allow change event to fire first
          setTimeout(() => {
            if (needsCameraRestartRef.current && mountedRef.current) {
              console.log("Gallery cancelled (focus detection) - restarting camera");
              needsCameraRestartRef.current = false;
              isGalleryOpenRef.current = false;
              restartCameraMode();
            }
          }, 300);
          window.removeEventListener("focus", handleFocus);
        };
        
        window.addEventListener("focus", handleFocus);
        input.click();
        
        // Cleanup timeout in case focus event doesn't fire
        setTimeout(() => {
          window.removeEventListener("focus", handleFocus);
          isGalleryOpenRef.current = false;
        }, 60000); // 1 minute safety timeout
      } catch {
        showCaptureError("Couldn't open file picker.");
        needsCameraRestartRef.current = false;
        isGalleryOpenRef.current = false;
        restartCameraMode();
      }
    }
  }, [isNative, setCapturedFile, showCaptureError, restartCameraMode]);


  const handleClose = useCallback((saved?: boolean) => {
    try {
      clearCaptured();
    } finally {
      onClose(saved);
    }
  }, [onClose, clearCaptured]);

  const handleRetake = useCallback(() => {
    clearCaptured();
    hasLaunchedNativeCameraRef.current = false;
    switchModeWithTransition("camera");
  }, [clearCaptured, switchModeWithTransition]);

  const handleAnalyze = useCallback(async () => {
    const imageFile = capturedFileRef.current;

    // STRICT CAPTURE VALIDATION
    if (!imageFile || imageFile.size <= 0) {
      showCaptureError("Image not captured. Please try again.");
      setState("camera");
      return;
    }

    try {
      setAnalysisReady(false);
      setState("analyzing");

      const result = await foodAnalysis.analyzeFood(imageFile);
      if (!result) {
        showCaptureError(foodAnalysis.error || "Analysis failed. Please try again.");
        setState("preview");
        return;
      }

      // Keep the analyzing screen until progress finishes (prevents 100% -> waiting)
      setAnalysisData(result);
      setAnalysisReady(true);
    } catch (e) {
      console.error("ANALYZE_FAILED", e);
      showCaptureError("Analysis failed. Please try again.");
      setState("preview");
    }
  }, [foodAnalysis, showCaptureError]);

  const handleAddToLog = useCallback(async () => {
    if (!analysisData) {
      toast.error("No analysis data to save");
      return;
    }

    // Get current session for guest users first (synchronously)
    const { data: { session } } = await supabase.auth.getSession();
    let userId = session?.user?.id;
    
    if (!userId) {
      const { data: { user: fallbackUser } } = await supabase.auth.getUser();
      userId = fallbackUser?.id;
    }
    
    if (!userId) {
      toast.error("Please sign in to save meals");
      return;
    }

    // CRITICAL: Capture file and preview URL BEFORE closing (onClose clears refs)
    const imageFile = capturedFileRef.current;
    const previewUrl = capturedPreviewUrl;
    const analysisToSave = analysisData;

    // OPTIMISTIC: Add pending meal and immediately close + navigate home
    addPendingMeal(analysisToSave, previewUrl);
    
    // Close scanner and navigate home immediately for premium feel
    onClose(true);
    navigate('/home');

    // Now save in the background using captured references
    try {
      console.log('Saving food log for user:', userId);

      // Compress image and upload to storage
      let uploadedImageUrl: string | null = null;
      
      if (imageFile && imageFile.size > 0) {
        try {
          console.log('Compressing image...', imageFile.name, imageFile.size);
          const compressedBase64 = await compressImageToBase64(imageFile, {
            maxWidth: 600,
            maxHeight: 600,
            quality: 0.6,
          });
          
          console.log('Uploading image to storage...');
          const { data: uploadData, error: uploadError } = await supabase.functions.invoke("upload-food-image", {
            body: {
              imageBase64: compressedBase64,
              fileName: 'food',
            },
          });
          
          if (!uploadError && uploadData?.imageUrl) {
            uploadedImageUrl = uploadData.imageUrl;
            console.log('Image uploaded:', uploadedImageUrl);
          } else {
            console.warn('Image upload failed, continuing without image:', uploadError);
          }
        } catch (imgError) {
          console.warn('Image processing failed, continuing without image:', imgError);
        }
      } else {
        console.warn('No image file available for upload');
      }

      // Call the save-food-log edge function
      const { data, error } = await supabase.functions.invoke("save-food-log", {
        body: {
          userId,
          analysis: analysisToSave,
          imageUrl: uploadedImageUrl,
        },
      });

      if (error) {
        console.error("Failed to save food log:", error);
        toast.error("Failed to save meal. Please try again.");
        clearPendingMeal();
        return;
      }

      if (data?.error) {
        console.error("Food log save error:", data.error);
        toast.error(data.error);
        clearPendingMeal();
        return;
      }

      console.log('Food log saved successfully:', data);
      toast.success("Meal added to your log!");

      // Refresh data - this will clear the pending meal when real data arrives
      if (refreshDataAsync) {
        try {
          await refreshDataAsync();
        } catch (refreshError) {
          console.warn('Data refresh failed:', refreshError);
        }
      }
    } catch (e) {
      console.error("Error saving food log:", e);
      toast.error("Failed to save meal. Please try again.");
      clearPendingMeal();
    }
  }, [analysisData, capturedPreviewUrl, addPendingMeal, clearPendingMeal, onClose, navigate, refreshDataAsync]);

  const handleSavingDone = useCallback(() => {
    toast.success("Meal added to your log!");
    handleClose(true);
  }, [handleClose]);

  // Hidden gallery input for web
  const galleryInput = (
    <input
      ref={galleryInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleGalleryChange}
    />
  );

  // Transition overlay - renders on top of everything during mode switches
  // Uses a higher z-index to ensure it covers all camera/barcode content
  const transitionOverlay = (
    <div 
      className={`fixed inset-0 z-[300] bg-black flex items-center justify-center transition-opacity duration-200 ${
        isTransitioning ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ backgroundColor: "#000000" }} // Ensure pure black, no transparency
    >
      <div className="text-center">
        <div className="h-16 w-16 rounded-full border-2 border-white/30 border-t-white animate-spin mx-auto mb-4" />
        <p className="text-white/80 text-sm">Loading...</p>
      </div>
    </div>
  );

  // Preview state
  if (state === "preview" && capturedPreviewUrl) {
    return (
      <>
        {galleryInput}
        {transitionOverlay}
        <CameraPreview
          image={capturedPreviewUrl}
          onRetake={handleRetake}
          onAnalyze={handleAnalyze}
          onClose={handleClose}
        />
      </>
    );
  }

  // Analyzing state
  if (state === "analyzing") {
    return (
      <>
        {galleryInput}
        {transitionOverlay}
        <AnalyzingScreen
          done={analysisReady}
          onDone={() => {
            if (analysisData) setState("results");
          }}
        />
      </>
    );
  }

  // Saving state - show loading while uploading image, saving, and refreshing data
  if (state === "saving") {
    return (
      <>
        {galleryInput}
        {transitionOverlay}
        <SavingScreen
          done={savingComplete}
          onDone={handleSavingDone}
        />
      </>
    );
  }

  // Results state
  if (state === "results" && analysisData) {
    return (
      <>
        {galleryInput}
        {transitionOverlay}
        <AnalysisResults
          image={capturedPreviewUrl}
          analysis={analysisData}
          onAddToLog={handleAddToLog}
          onClose={handleClose}
        />
      </>
    );
  }

  // Barcode scanning state
  if (state === "barcode") {
    return (
      <>
        {galleryInput}
        {transitionOverlay}
        <BarcodeScanner
          onClose={() => handleClose()}
          onBarcodeDetected={async (barcode) => {
            // When barcode is detected, analyze the product
            setAnalysisReady(false);
            setState("analyzing");
            try {
              const result = await foodAnalysis.analyzeBarcodeProduct(barcode);
              if (result) {
                setAnalysisData(result);
                setAnalysisReady(true);
              } else {
                toast.error("Couldn't find product info for this barcode");
                hasLaunchedNativeCameraRef.current = false;
                switchModeWithTransition("camera");
              }
            } catch (e) {
              console.error("Barcode analysis failed:", e);
              toast.error("Failed to analyze barcode");
              hasLaunchedNativeCameraRef.current = false;
              switchModeWithTransition("camera");
            }
          }}
          onSwitchToFood={() => {
            hasLaunchedNativeCameraRef.current = false;
            switchModeWithTransition("camera");
          }}
          onGallery={openGallery}
          onReady={() => onModeReady("barcode")}
        />
      </>
    );
  }

  // Native permission denied state - show Open Settings
  if (state === "native-denied") {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col">
        {transitionOverlay}
        {/* Header */}
        <header
          className="flex items-center justify-between px-4"
          style={{ paddingTop: "max(calc(env(safe-area-inset-top) + 16px), 28px)" }}
        >
          <button
            onClick={() => handleClose()}
            className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center"
          >
            <X className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-white font-semibold text-base">Scan Food</h1>
          <div className="w-10" />
        </header>

        {/* Content */}
        <main className="flex-1 flex items-center justify-center px-8">
          <div className="text-center max-w-sm">
            <div className="h-20 w-20 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
              <Camera className="h-10 w-10 text-rose-400" />
            </div>
            <p className="text-white text-lg font-semibold mb-2">Camera Access Required</p>
            <p className="text-white/60 text-sm mb-6">
              Please enable camera access in your device Settings to scan food.
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    await openNativeAppSettings();
                  } catch (e) {
                    console.error("Failed to open settings:", e);
                    toast.error("Couldn't open settings. Please go to Settings manually.");
                  }
                }}
                className="w-full px-6 py-3 rounded-xl bg-white text-black font-medium text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Open Settings
              </button>
              <button
                onClick={openGallery}
                className="w-full px-6 py-3 rounded-xl bg-white/10 text-white font-medium text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <Images className="h-4 w-4" />
                Choose from Gallery
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Camera state - Use our custom LiveCameraView on ALL platforms (web + native)
  // LiveCameraView handles native permission request via Capacitor before starting getUserMedia
  return (
    <>
      {galleryInput}
      {transitionOverlay}
      <LiveCameraView
        key={cameraInstanceKey}
        onClose={() => handleClose()}
        onCapture={setCapturedFile}
        onGallery={openGallery}
        onBarcodeMode={() => switchModeWithTransition("barcode")}
        onPermissionDenied={() => setState("native-denied")}
        onReady={() => onModeReady("camera")}
      />
    </>
  );
};
