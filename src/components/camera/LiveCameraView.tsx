import { useRef, useEffect, useState, useCallback } from "react";
import { X, Images, RefreshCw, Camera, ScanBarcode, Zap, Settings } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

interface LiveCameraViewProps {
  onClose: () => void;
  onCapture: (file: File) => void;
  onGallery: () => void;
  onBarcodeMode?: () => void;
  onPermissionDenied?: () => void;
  onReady?: () => void;
}

// Helper to stop a media stream
const stopMediaStream = (stream: MediaStream | null) => {
  if (stream) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const getTouchDistance = (touches: React.TouchList) => {
  const a = touches[0];
  const b = touches[1];
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

type PermissionState = "checking" | "prompt" | "granted" | "denied";

export function LiveCameraView({ onClose, onCapture, onGallery, onBarcodeMode, onPermissionDenied, onReady }: LiveCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const mountedRef = useRef(true);
  const isRequestingRef = useRef(false);
  const hasSignaledReadyRef = useRef(false);
  const lastTapRef = useRef<number>(0);

  const [permissionState, setPermissionState] = useState<PermissionState>("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [flashOn, setFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const [isZooming, setIsZooming] = useState(false);
  const zoomHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Double-tap to zoom handler
  const handleDoubleTap = useCallback(async (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected - toggle between 1x and 2x
      const newZoom = zoom === 1 ? Math.min(2, maxZoom) : 1;
      setZoom(newZoom);
      setIsZooming(true);
      
      // Clear any pending hide timeout
      if (zoomHideTimeoutRef.current) {
        clearTimeout(zoomHideTimeoutRef.current);
      }
      
      // Apply zoom via track constraints
      if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        if (track) {
          try {
            const capabilities = track.getCapabilities() as any;
            if (capabilities?.zoom) {
              await track.applyConstraints({ advanced: [{ zoom: newZoom } as any] });
            }
          } catch {
            // Fallback to CSS zoom
          }
        }
      }
      
      // Hide indicator after delay
      zoomHideTimeoutRef.current = setTimeout(() => {
        setIsZooming(false);
      }, 1200);
      
      lastTapRef.current = 0; // Reset to prevent triple-tap
    } else {
      lastTapRef.current = now;
    }
  }, [zoom, maxZoom]);

  const isNative = Capacitor.isNativePlatform();

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Check current camera permission status (without triggering dialog)
  const checkCameraPermission = useCallback(async (): Promise<"granted" | "denied" | "prompt" | "limited"> => {
    try {
      const { Camera: CapacitorCamera } = await import("@capacitor/camera");
      const checkResult = await CapacitorCamera.checkPermissions();
      console.log("Camera permission check:", checkResult);
      
      // iOS returns "limited" for restricted access
      return checkResult.camera as "granted" | "denied" | "prompt" | "limited";
    } catch (e) {
      console.error("Permission check failed:", e);
      return "denied";
    }
  }, []);

  // Request native camera permission via Capacitor (triggers system dialog on Android/iOS)
  const requestNativeCameraPermission = useCallback(async (): Promise<"granted" | "denied" | "prompt"> => {
    try {
      const { Camera: CapacitorCamera } = await import("@capacitor/camera");
      
      // First check current permission status
      const currentStatus = await checkCameraPermission();
      console.log("Current camera permission:", currentStatus);
      
      // Already granted (includes iOS "limited" which still allows camera)
      if (currentStatus === "granted" || currentStatus === "limited") {
        return "granted";
      }
      
      // On iOS, if permission was denied previously, requestPermissions won't show dialog
      // It will just return "denied" immediately. User must go to Settings.
      if (currentStatus === "denied") {
        return "denied";
      }
      
      // Permission is "prompt" - request permission (triggers native system dialog)
      const requestResult = await CapacitorCamera.requestPermissions({ permissions: ["camera"] });
      console.log("Camera permission request result:", requestResult);
      
      // iOS may return "limited" after request
      if (requestResult.camera === "limited") {
        return "granted";
      }
      
      return requestResult.camera as "granted" | "denied" | "prompt";
    } catch (e) {
      console.error("Native camera permission request failed:", e);
      return "denied";
    }
  }, [checkCameraPermission]);

  // Start camera stream
  const startCamera = useCallback(async (facing: "environment" | "user") => {
    // Prevent duplicate requests
    if (!mountedRef.current || isRequestingRef.current) return;
    isRequestingRef.current = true;
    
    setIsLoading(true);
    setError(null);

    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      // On native platforms, request permission via Capacitor FIRST
      // This ensures the system permission dialog appears and is registered by the OS
      if (isNative) {
        const permStatus = await requestNativeCameraPermission();
        
        if (permStatus === "denied") {
          if (mountedRef.current) {
            // If callback provided, let parent handle denied state
            if (onPermissionDenied) {
              onPermissionDenied();
              isRequestingRef.current = false;
              return;
            }
            setPermissionState("denied");
            setError("permission_denied");
            setIsLoading(false);
          }
          isRequestingRef.current = false;
          return;
        }
        
        // If permission is "prompt", the dialog was shown but user cancelled
        // Still try getUserMedia as it might work
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      // Now get the camera stream (permission already granted via Capacitor on native)
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        isRequestingRef.current = false;
        return;
      }

      streamRef.current = stream;
      setPermissionState("granted");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        
        // Get zoom capabilities
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities() as any;
          if (capabilities?.zoom) {
            setMaxZoom(capabilities.zoom.max || 3);
            try {
              await track.applyConstraints({ advanced: [{ zoom: 1 } as any] });
            } catch {
              // Fallback to CSS zoom
            }
          }
        }
      }

      setIsLoading(false);
      isRequestingRef.current = false;
      
      // Signal parent that camera is ready
      if (!hasSignaledReadyRef.current) {
        hasSignaledReadyRef.current = true;
        onReady?.();
      }
    } catch (e: any) {
      isRequestingRef.current = false;
      if (!mountedRef.current) return;
      
      console.error("Camera access failed:", e);
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        // If callback provided, let parent handle denied state
        if (onPermissionDenied) {
          onPermissionDenied();
          return;
        }
        setPermissionState("denied");
        setError("permission_denied");
      } else {
        setError("Unable to access camera. Please try again.");
      }
      setIsLoading(false);
    }
  }, [isNative, requestNativeCameraPermission, onPermissionDenied]);

  // Request camera permission - triggers system dialog
  const requestCameraPermission = useCallback(() => {
    setPermissionState("checking");
    startCamera(facingMode);
  }, [facingMode, startCamera]);

  // Initialize: check permission and start camera
  useEffect(() => {
    requestCameraPermission();
  }, []);

  // App resume listener - auto-retry camera when user returns from Settings
  // Use both "resume" and "appStateChange" for better iOS compatibility
  useEffect(() => {
    if (!isNative) return;

    let removeResumeListener: (() => void) | undefined;
    let removeStateListener: (() => void) | undefined;
    const permissionStateRef = { current: permissionState };
    permissionStateRef.current = permissionState;

    const handleAppResume = async () => {
      console.log("App resumed, checking camera permission...");
      
      // Only retry if was in denied state
      if (permissionStateRef.current !== "denied" || !mountedRef.current) {
        return;
      }

      // Check if permission was granted in Settings
      const newStatus = await checkCameraPermission();
      console.log("Permission after resume:", newStatus);
      
      if ((newStatus === "granted" || newStatus === "limited") && mountedRef.current) {
        // Permission was granted in Settings - restart camera
        isRequestingRef.current = false; // Reset the guard
        requestCameraPermission();
      }
    };

    const setupListeners = async () => {
      try {
        const { App } = await import("@capacitor/app");
        
        // "resume" event - fires when app comes to foreground (Android & iOS)
        const resumeListener = await App.addListener("resume", handleAppResume);
        removeResumeListener = () => resumeListener.remove();
        
        // "appStateChange" event - more reliable on iOS for Settings return
        const stateListener = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            handleAppResume();
          }
        });
        removeStateListener = () => stateListener.remove();
      } catch (e) {
        console.warn("Could not setup app resume listeners:", e);
      }
    };

    setupListeners();

    return () => {
      removeResumeListener?.();
      removeStateListener?.();
    };
  }, [isNative, permissionState, requestCameraPermission, checkCameraPermission]);

  // Switch camera
  const switchCamera = useCallback(() => {
    const newMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newMode);
    startCamera(newMode);
  }, [facingMode, startCamera]);

  // Toggle flash/torch
  const toggleFlash = useCallback(async () => {
    try {
      if (!streamRef.current) return;

      const track = streamRef.current.getVideoTracks()[0];
      if (!track) return;

      const capabilities = track.getCapabilities() as any;
      if (capabilities?.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !flashOn } as any],
        });
        setFlashOn(!flashOn);
      } else {
        toast.error("Flash not available on this device");
      }
    } catch (e) {
      console.error("Flash toggle error:", e);
      toast.error("Couldn't toggle flash");
    }
  }, [flashOn]);

  // Capture photo
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !streamRef.current) {
      setError("Camera not ready. Please try again.");
      return;
    }

    // Set canvas size to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Failed to capture. Please try again.");
      return;
    }

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob/file
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Failed to capture image. Please try again.");
          return;
        }

        const file = new File([blob], "food.jpg", { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.9
    );
  }, [onCapture]);

  // Handle barcode mode switch - MUST stop camera stream first
  const handleBarcodeMode = useCallback(async () => {
    console.log("Switching to barcode mode - stopping camera stream...");
    
    // Turn off flash before switching
    if (flashOn && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({ advanced: [{ torch: false } as any] });
        } catch {
          // Ignore flash errors
        }
      }
      setFlashOn(false);
    }
    
    // Stop the camera stream completely
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Small delay to ensure camera is fully released
    await new Promise((resolve) => setTimeout(resolve, 50));
    
    console.log("Camera stopped, switching to barcode mode...");
    onBarcodeMode?.();
  }, [flashOn, onBarcodeMode]);

  // Handle gallery - MUST stop camera stream first to unblock native gallery picker
  const handleGallery = useCallback(async () => {
    console.log("Gallery button tapped - stopping camera stream...");
    
    // Turn off flash first
    if (flashOn && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({ advanced: [{ torch: false } as any] });
        } catch {
          // Ignore flash errors
        }
      }
      setFlashOn(false);
    }
    
    // Stop the camera stream completely
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Small delay to ensure camera is fully released (prevents race conditions on Android)
    await new Promise((resolve) => setTimeout(resolve, 150));
    
    console.log("Camera stopped, opening gallery...");
    
    // Now call the gallery handler
    onGallery();
  }, [flashOn, onGallery]);

  // Determine if camera is ready (stream active and video playing)
  const isCameraReady = permissionState === "granted" && !isLoading && streamRef.current;

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden flex flex-col" style={{ backgroundColor: "#000000" }}>
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* SOLID BLACK LOADING OVERLAY - covers everything until camera is ready */}
      <div 
        className={`absolute inset-0 z-[250] flex items-center justify-center transition-opacity duration-200 ${
          isCameraReady ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{ backgroundColor: "#000000" }}
      >
        {/* Loading state */}
        {(permissionState === "checking" || isLoading) && permissionState !== "denied" && (
          <div className="text-center">
            <div className="h-16 w-16 rounded-full border-2 border-white/30 border-t-white animate-spin mx-auto mb-4" />
            <p className="text-white/80 text-sm">Setting up camera...</p>
          </div>
        )}
      </div>

      {/* Video preview - fades in when camera is ready */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ease-out ${
          isCameraReady ? "opacity-100" : "opacity-0"
        }`}
        style={{ touchAction: "none" }}
        onTouchStart={(e) => {
          // Handle double-tap for single finger
          if (e.touches.length === 1) {
            handleDoubleTap(e);
          }
          // Handle pinch-to-zoom for two fingers
          if (e.touches.length === 2) {
            pinchRef.current = { startDist: getTouchDistance(e.touches), startZoom: zoom };
            setIsZooming(true);
            if (zoomHideTimeoutRef.current) {
              clearTimeout(zoomHideTimeoutRef.current);
            }
          }
        }}
        onTouchMove={async (e) => {
          if (e.touches.length === 2 && pinchRef.current) {
            e.preventDefault();
            const dist = getTouchDistance(e.touches);
            const ratio = dist / pinchRef.current.startDist;
            const newZoom = clamp(pinchRef.current.startZoom * ratio, 1, maxZoom);
            setZoom(newZoom);
            
            // Apply real zoom via track constraints
            if (streamRef.current) {
              const track = streamRef.current.getVideoTracks()[0];
              if (track) {
                try {
                  const capabilities = track.getCapabilities() as any;
                  if (capabilities?.zoom) {
                    await track.applyConstraints({ advanced: [{ zoom: newZoom } as any] });
                  }
                } catch {
                  // Fallback handled by CSS transform
                }
              }
            }
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length < 2) {
            pinchRef.current = null;
            // Hide zoom indicator after delay
            zoomHideTimeoutRef.current = setTimeout(() => {
              setIsZooming(false);
            }, 800);
          }
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: `${facingMode === "user" ? "scaleX(-1) " : ""}scale(${zoom})`,
            transformOrigin: "center center",
          }}
        />
      </div>

      {/* Overlay UI - fades in when camera is ready OR showing permission denied */}
      <div 
        className={`relative z-10 flex flex-col h-full transition-opacity duration-500 ease-out ${
          isCameraReady || permissionState === "denied" ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Top bar - moved down with more padding */}
        <header
          className="flex items-center justify-between px-4"
          style={{ paddingTop: "max(calc(env(safe-area-inset-top) + 16px), 28px)" }}
        >
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-all"
            aria-label="Close camera"
          >
            <X className="h-5 w-5 text-white" />
          </button>

          <h1 className="text-white font-semibold text-base">Scan Food</h1>

          <button
            onClick={switchCamera}
            className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-all"
            aria-label="Switch camera"
          >
            <RefreshCw className="h-5 w-5 text-white" />
          </button>
        </header>

        {/* Zoom Indicator - appears during pinch gesture */}
        <div 
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-300 ${
            isZooming || zoom > 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
          }`}
        >
          <div className="bg-black/60 backdrop-blur-xl rounded-full px-5 py-2.5 flex items-center gap-3">
            {/* Zoom level text */}
            <span className="text-white font-semibold text-lg tabular-nums">
              {zoom.toFixed(1)}x
            </span>
            {/* Mini zoom bar */}
            <div className="w-20 h-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-100"
                style={{ width: `${((zoom - 1) / (maxZoom - 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Center - Scan frame */}
        <main className="flex-1 flex items-center justify-center">

          {/* Permission denied state - show Open Settings button */}
          {permissionState === "denied" && (
            <div className="text-center px-8 max-w-sm">
              <div className="h-20 w-20 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
                <Camera className="h-10 w-10 text-rose-400" />
              </div>
              <p className="text-white text-lg font-semibold mb-2">Camera Access Denied</p>
              <p className="text-white/60 text-sm mb-6">
                Camera permission was denied. Please enable it in your device Settings to scan food.
              </p>
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    try {
                      // Open device app settings on native platforms
                      if (Capacitor.isNativePlatform()) {
                        const { NativeSettings, AndroidSettings, IOSSettings } = await import("capacitor-native-settings");
                        
                        await NativeSettings.open({
                          optionAndroid: AndroidSettings.ApplicationDetails,
                          optionIOS: IOSSettings.App,
                        });
                      } else {
                        // On web, just show a toast with instructions
                        toast.info("Please enable camera access in your browser settings");
                      }
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
                  onClick={handleGallery}
                  className="w-full px-6 py-3 rounded-xl bg-white/10 text-white font-medium text-sm active:scale-95 transition-transform"
                >
                  Choose from Gallery
                </button>
              </div>
            </div>
          )}

          {/* Other error state */}
          {error && error !== "permission_denied" && permissionState !== "denied" && (
            <div className="text-center px-8 max-w-sm">
              <div className="h-20 w-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                <Camera className="h-10 w-10 text-white/60" />
              </div>
              <p className="text-white text-base font-medium mb-2">Camera Error</p>
              <p className="text-white/60 text-sm mb-6">{error}</p>
              <button
                onClick={requestCameraPermission}
                className="px-6 py-3 rounded-xl bg-white text-black font-medium text-sm active:scale-95 transition-transform"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Camera ready state */}
          {permissionState === "granted" && !error && (
            <div className="relative">
              <div className="w-72 h-72 relative">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 288 288">
                  <path
                    d="M 4 60 L 4 20 Q 4 4 20 4 L 60 4"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 228 4 L 268 4 Q 284 4 284 20 L 284 60"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 4 228 L 4 268 Q 4 284 20 284 L 60 284"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 284 228 L 284 268 Q 284 284 268 284 L 228 284"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-white/70 text-sm text-center mt-4">Position food in frame</p>
            </div>
          )}
        </main>

        {/* Bottom controls */}
        {permissionState === "granted" && !error && (
          <footer className="pb-8 px-6" style={{ paddingBottom: "max(calc(env(safe-area-inset-bottom) + 24px), 40px)" }}>
            {/* Mode Selector Pills */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex bg-white/10 backdrop-blur-xl rounded-full p-1 gap-1">
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white text-black transition-all"
                >
                  <Camera className="w-4 h-4" />
                  Scan Food
                </button>
                <button
                  onClick={handleBarcodeMode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-white hover:bg-white/10 transition-all"
                >
                  <ScanBarcode className="w-4 h-4" />
                </button>
                <button
                  onClick={handleGallery}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-white hover:bg-white/10 transition-all"
                >
                  <Images className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center relative">
              {/* Flash Toggle */}
              <button
                onClick={toggleFlash}
                className={`absolute left-0 h-12 w-12 rounded-xl flex items-center justify-center active:scale-90 transition-all ${
                  flashOn 
                    ? "bg-yellow-400 text-black" 
                    : "bg-white/10 backdrop-blur-xl text-white"
                }`}
                aria-label="Toggle flash"
              >
                <Zap className={`h-5 w-5 ${flashOn ? "fill-current" : ""}`} />
              </button>

              {/* Capture Button */}
              <button
                onClick={capturePhoto}
                className="group active:scale-90 transition-all"
                aria-label="Capture photo"
              >
                <div className="relative flex items-center justify-center">
                  <div className="h-[72px] w-[72px] rounded-full border-[3px] border-white flex items-center justify-center">
                    <div className="h-[58px] w-[58px] rounded-full bg-white group-active:bg-white/80 transition-colors" />
                  </div>
                </div>
              </button>

              <div className="absolute right-0 w-12" />
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
