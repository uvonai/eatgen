import { useEffect, useCallback, useRef, useState } from "react";
import { useZxing } from "react-zxing";
import { X, Zap, ScanBarcode, Camera, Images } from "lucide-react";
import { toast } from "sonner";

interface BarcodeScannerProps {
  onClose: () => void;
  onBarcodeDetected: (barcode: string) => void;
  onSwitchToFood: () => void;
  onGallery: () => void;
  onReady?: () => void;
}

export function BarcodeScanner({
  onClose,
  onBarcodeDetected,
  onSwitchToFood,
  onGallery,
  onReady,
}: BarcodeScannerProps) {
  const hasDetectedRef = useRef(false);
  const hasSignaledReadyRef = useRef(false);
  const [isScanning, setIsScanning] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { ref, torch } = useZxing({
    paused: !isScanning,
    onResult(result) {
      if (hasDetectedRef.current) return;

      const barcode = result.getText();
      if (!barcode) return;

      hasDetectedRef.current = true;
      setIsScanning(false);
      toast.success(`Barcode detected: ${barcode}`);
      onBarcodeDetected(barcode);
    },
    onError(error) {
      // Only log real errors, not "NotFoundException" which happens constantly while scanning.
      const errorMsg = error?.message || String(error);
      if (!errorMsg.includes("No MultiFormat Readers") && !errorMsg.includes("NotFoundException")) {
        console.warn("Barcode scan error:", error);
        setLastError(errorMsg);
      }
    },
    constraints: {
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    timeBetweenDecodingAttempts: 100,
  });

  // Detect when video is ready and signal parent
  useEffect(() => {
    const videoEl = ref.current;
    if (!videoEl) return;

    const handleCanPlay = () => {
      if (!hasSignaledReadyRef.current) {
        hasSignaledReadyRef.current = true;
        setIsLoading(false);
        onReady?.();
      }
    };

    // Check if already ready
    if (videoEl.readyState >= 3) {
      handleCanPlay();
    }

    videoEl.addEventListener("canplay", handleCanPlay);
    videoEl.addEventListener("loadeddata", handleCanPlay);

    // Fallback timeout - signal ready after 1 second even if events don't fire
    const fallbackTimeout = setTimeout(() => {
      if (!hasSignaledReadyRef.current) {
        hasSignaledReadyRef.current = true;
        setIsLoading(false);
        onReady?.();
      }
    }, 1000);

    return () => {
      videoEl.removeEventListener("canplay", handleCanPlay);
      videoEl.removeEventListener("loadeddata", handleCanPlay);
      clearTimeout(fallbackTimeout);
    };
  }, [ref, onReady]);

  // Toggle flash/torch using built-in torch from react-zxing
  const toggleFlash = useCallback(async () => {
    try {
      if (torch.isAvailable) {
        if (torch.isOn) {
          await torch.off();
        } else {
          await torch.on();
        }
      } else {
        toast.error("Flash not available on this device");
      }
    } catch (e) {
      console.error("Flash toggle error:", e);
      toast.error("Couldn't toggle flash");
    }
  }, [torch]);

  // Handle gallery - stop camera stream first to unblock native gallery picker
  const handleGallery = useCallback(async () => {
    console.log("Gallery button tapped in BarcodeScanner - stopping camera...");
    
    // Turn off flash first
    if (torch.isOn) {
      try {
        await torch.off();
      } catch {
        // Ignore flash errors
      }
    }
    
    // Stop scanning
    setIsScanning(false);
    
    // Set loading to show black overlay during transition
    setIsLoading(true);
    
    // Stop the video stream from the ref
    const videoEl = ref.current;
    if (videoEl && videoEl.srcObject instanceof MediaStream) {
      videoEl.srcObject.getTracks().forEach((track) => {
        console.log(`Stopping track: ${track.kind}`);
        track.stop();
      });
      videoEl.srcObject = null;
    }
    
    // Longer delay to ensure camera is fully released (especially on Android)
    await new Promise((resolve) => setTimeout(resolve, 250));
    
    console.log("Camera stopped, calling gallery handler...");
    onGallery();
  }, [torch, ref, onGallery]);

  // Handle switch to food mode - stop camera stream first
  const handleSwitchToFood = useCallback(async () => {
    console.log("Switching to food mode - stopping barcode camera...");
    
    // Turn off flash first
    if (torch.isOn) {
      try {
        await torch.off();
      } catch {
        // Ignore flash errors
      }
    }
    
    // Stop scanning
    setIsScanning(false);
    
    // Set loading to show black overlay during transition
    setIsLoading(true);
    
    // Stop the video stream from the ref
    const videoEl = ref.current;
    if (videoEl && videoEl.srcObject instanceof MediaStream) {
      videoEl.srcObject.getTracks().forEach((track) => {
        console.log(`Stopping track: ${track.kind}`);
        track.stop();
      });
      videoEl.srcObject = null;
    }
    
    // Delay to ensure camera is fully released
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    console.log("Camera stopped, switching to food mode...");
    onSwitchToFood();
  }, [torch, ref, onSwitchToFood]);

  // Cleanup flash on unmount
  useEffect(() => {
    return () => {
      if (torch.isOn) {
        torch.off().catch(() => {});
      }
    };
  }, [torch]);

  const isScannerReady = !isLoading;

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden flex flex-col" style={{ backgroundColor: "#000000" }}>
      {/* SOLID BLACK LOADING OVERLAY - covers everything until scanner is ready */}
      <div 
        className={`absolute inset-0 z-[250] flex items-center justify-center transition-opacity duration-200 ${
          isScannerReady ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{ backgroundColor: "#000000" }}
      >
        <div className="text-center">
          <div className="h-16 w-16 rounded-full border-2 border-white/30 border-t-white animate-spin mx-auto mb-4" />
          <p className="text-white/80 text-sm">Setting up scanner...</p>
        </div>
      </div>

      {/* Video preview - fades in when scanner is ready */}
      <div 
        className={`absolute inset-0 transition-opacity duration-500 ease-out ${
          isScannerReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <video
          ref={ref}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      </div>

      {/* Overlay UI - fades in when scanner is ready */}
      <div 
        className={`relative z-10 flex flex-col h-full transition-opacity duration-500 ease-out ${
          isScannerReady ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 pt-3"
          style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
        >
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-all"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-white" />
          </button>

          <h1 className="text-white font-semibold text-base">Scan Barcode</h1>

          <div className="w-10" />
        </header>

        {/* Center - Barcode scan frame */}
        <main className="flex-1 flex flex-col items-center justify-center">
          <div className="relative">
            {/* Horizontal barcode scan frame */}
            <div className="w-72 h-32 relative">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 288 128">
                <path
                  d="M 4 40 L 4 12 Q 4 4 12 4 L 40 4"
                  stroke="white"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 248 4 L 276 4 Q 284 4 284 12 L 284 40"
                  stroke="white"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 4 88 L 4 116 Q 4 124 12 124 L 40 124"
                  stroke="white"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 284 88 L 284 116 Q 284 124 276 124 L 248 124"
                  stroke="white"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              
              {/* Scanning line animation */}
              <div className="absolute inset-x-6 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent animate-pulse" />
            </div>
            <p className="text-white/70 text-sm text-center mt-4">Position barcode in frame</p>
          </div>

          {/* Manual Capture Button */}
          <button
            onClick={() => {
              // Reset detection to allow retry
              hasDetectedRef.current = false;
              setIsScanning(true);
              toast.info("Scanning... hold barcode steady in frame");
            }}
            className="mt-8 w-20 h-20 rounded-full bg-white flex items-center justify-center active:scale-90 transition-all shadow-lg"
            aria-label="Capture barcode"
          >
            <ScanBarcode className="w-8 h-8 text-black" />
          </button>
          <p className="text-white/50 text-xs text-center mt-3">
            {isScanning ? "Hold barcode in frame" : "Tap to scan again"}
          </p>
        </main>

        {/* Bottom controls */}
        <footer
          className="pb-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
        >
          {/* Mode Selector Pills */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex bg-white/10 backdrop-blur-xl rounded-full p-1 gap-1">
              <button
                onClick={handleSwitchToFood}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white hover:bg-white/10 transition-all"
              >
                <Camera className="w-4 h-4" />
                Scan Food
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium bg-white text-black transition-all"
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

          {/* Flash Toggle (no capture button for barcode - auto-detect) */}
          <div className="flex items-center justify-center px-8">
            <button
              onClick={toggleFlash}
              className={`h-12 w-12 rounded-xl flex items-center justify-center active:scale-90 transition-all ${
                torch.isOn
                  ? "bg-yellow-400 text-black"
                  : "bg-white/10 backdrop-blur-xl text-white"
              }`}
              aria-label="Toggle flash"
            >
              <Zap className={`h-5 w-5 ${torch.isOn ? "fill-current" : ""}`} />
            </button>
          </div>
          
          <p className="text-white/50 text-xs text-center mt-4">
            Barcode will be detected automatically
          </p>
        </footer>
      </div>
    </div>
  );
}
