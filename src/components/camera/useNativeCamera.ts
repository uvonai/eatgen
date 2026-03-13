import { useCallback, useState, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// Lazy import types to prevent crashes if module isn't available
type Photo = {
  webPath?: string;
  path?: string;
  format?: string;
};

export type NativeCameraStatus = "idle" | "requesting" | "ready" | "denied" | "error";

// Safe check for native platform
function safeIsNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function useNativeCamera() {
  const [status, setStatus] = useState<NativeCameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount to prevent state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isNative = safeIsNative();

  const checkPermissions = useCallback(async (): Promise<string> => {
    if (!isNative) return "granted";

    try {
      const { Camera } = await import("@capacitor/camera");
      const perms = await Promise.race([
        Camera.checkPermissions(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]) as any;
      return perms?.camera || "prompt";
    } catch (e) {
      console.warn("NATIVE_CAMERA_CHECK_PERMS_ERROR (non-fatal):", e);
      return "prompt";
    }
  }, [isNative]);

  const checkGalleryPermissions = useCallback(async (): Promise<string> => {
    if (!isNative) return "granted";

    try {
      const { Camera } = await import("@capacitor/camera");
      const perms = await Promise.race([
        Camera.checkPermissions(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]) as any;
      // On Android 13+, photos permission is separate
      return perms?.photos || "prompt";
    } catch (e) {
      console.warn("NATIVE_GALLERY_CHECK_PERMS_ERROR (non-fatal):", e);
      return "prompt";
    }
  }, [isNative]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!isNative) return true;

    if (mountedRef.current) {
      setStatus("requesting");
      setError(null);
    }

    try {
      const { Camera } = await import("@capacitor/camera");
      
      const result = await Promise.race([
        Camera.requestPermissions({ permissions: ["camera"] }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000))
      ]) as any;

      if (!mountedRef.current) return false;

      if (result?.camera === "granted") {
        setStatus("ready");
        return true;
      }

      if (result?.camera === "denied") {
        setStatus("denied");
        setError("Camera permission denied. Please enable it in Settings.");
        return false;
      }

      setStatus("idle");
      return false;
    } catch (e: any) {
      console.warn("NATIVE_CAMERA_REQUEST_PERMS_ERROR (non-fatal):", e);
      if (mountedRef.current) {
        setStatus("error");
        setError(e?.message || "Failed to request camera permission");
      }
      return false;
    }
  }, [isNative]);

  const requestGalleryPermissions = useCallback(async (): Promise<boolean> => {
    if (!isNative) return true;

    try {
      const { Camera } = await import("@capacitor/camera");
      
      const result = await Promise.race([
        Camera.requestPermissions({ permissions: ["photos"] }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000))
      ]) as any;

      if (!mountedRef.current) return false;

      // Accept "granted" or "limited" (iOS partial access)
      if (result?.photos === "granted" || result?.photos === "limited") {
        return true;
      }

      if (result?.photos === "denied") {
        return false;
      }

      return false;
    } catch (e: any) {
      console.warn("NATIVE_GALLERY_REQUEST_PERMS_ERROR (non-fatal):", e);
      return false;
    }
  }, [isNative]);

  const takePhoto = useCallback(async (): Promise<Photo | null> => {
    if (!isNative) return null;

    if (mountedRef.current) {
      setStatus("requesting");
      setError(null);
    }

    try {
      const { Camera, CameraResultType, CameraSource, CameraDirection } = await import("@capacitor/camera");
      
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
        direction: CameraDirection.Rear,
        saveToGallery: false,
        presentationStyle: "fullscreen",
      });

      if (!mountedRef.current) return null;
      
      setStatus("ready");

      if (photo?.webPath || photo?.path) return photo;
      console.warn("NATIVE_CAMERA_NO_URI", photo);
      return null;
    } catch (e: any) {
      console.warn("NATIVE_CAMERA_CAPTURE_ERROR (non-fatal):", e);

      if (!mountedRef.current) return null;

      const message = e?.message?.toLowerCase() || "";
      
      // User cancelled - not an error
      if (message.includes("cancel")) {
        setStatus("idle");
        return null;
      }

      // Permission denied
      if (message.includes("denied") || message.includes("permission")) {
        setStatus("denied");
        setError("Camera permission denied");
        return null;
      }

      setStatus("error");
      setError(e?.message || "Camera unavailable");
      return null;
    }
  }, [isNative]);

  const pickFromGallery = useCallback(async (): Promise<Photo | null> => {
    if (!isNative) return null;

    if (mountedRef.current) {
      setStatus("requesting");
      setError(null);
    }

    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      
      console.log("NATIVE_GALLERY: Attempting to pick photo...");
      
      // Use getPhoto with Photos source - this triggers the native photo picker
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        correctOrientation: true,
        presentationStyle: "popover", // Use popover for better native picker experience
      });

      console.log("NATIVE_GALLERY: Photo picked:", photo);

      if (!mountedRef.current) return null;
      
      setStatus("ready");

      if (photo?.webPath || photo?.path) return photo;
      console.warn("NATIVE_GALLERY_NO_URI", photo);
      return null;
    } catch (e: any) {
      console.warn("NATIVE_GALLERY_PICK_ERROR (non-fatal):", e);

      if (!mountedRef.current) return null;

      const message = e?.message?.toLowerCase() || "";
      
      // User cancelled - not an error
      if (message.includes("cancel") || message.includes("user denied")) {
        setStatus("idle");
        return null;
      }

      // Permission denied
      if (message.includes("denied") || message.includes("permission")) {
        setStatus("denied");
        setError("Gallery access denied. Please enable it in Settings.");
        return null;
      }

      setStatus("error");
      setError(e?.message || "Gallery unavailable");
      return null;
    }
  }, [isNative]);

  return {
    isNative,
    status,
    error,
    checkPermissions,
    checkGalleryPermissions,
    requestPermissions,
    requestGalleryPermissions,
    takePhoto,
    pickFromGallery,
  };
}
