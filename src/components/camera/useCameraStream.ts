import { useCallback, useEffect, useRef, useState } from "react";

export type CameraPermissionState = "unknown" | "prompt" | "granted" | "denied";
export type CameraInitState = "idle" | "requesting" | "initializing" | "ready" | "error";

function mapPermissionState(state: string): CameraPermissionState {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

async function waitForFirstFrame(video: HTMLVideoElement, timeoutMs = 15000) {
  const start = performance.now();

  return await new Promise<void>((resolve, reject) => {
    const tick = () => {
      const hasMeta = video.videoWidth > 0 && video.videoHeight > 0;
      const hasData = video.readyState >= 2; // HAVE_CURRENT_DATA

      if (hasMeta && hasData) return resolve();
      if (performance.now() - start > timeoutMs) return reject(new Error("VIDEO_FRAME_TIMEOUT"));

      requestAnimationFrame(tick);
    };

    tick();
  });
}

export function useCameraStream(enabled: boolean = true) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [permission, setPermission] = useState<CameraPermissionState>("unknown");
  const [status, setStatus] = useState<CameraInitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasFrames, setHasFrames] = useState(false);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setHasFrames(false);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (!enabled) return;

    setStatus("requesting");
    setError(null);
    setHasFrames(false);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("CAMERA_API_UNAVAILABLE");
      }

      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          aspectRatio: { ideal: 4 / 3 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setPermission("granted");
      setStatus("initializing");

      const video = videoRef.current;
      if (!video) throw new Error("VIDEO_NOT_READY");

      // Attach stream
      video.srcObject = stream;

      // Mobile reliability
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.muted = true;

      // Wait metadata, then play - increased timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("VIDEO_METADATA_TIMEOUT")), 15000);
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("VIDEO_ERROR"));
        };
      });

      await video.play();

      // IMPORTANT: only mark ready after first frames are actually available.
      await waitForFirstFrame(video, 15000);

      setHasFrames(true);
      setStatus("ready");
    } catch (e: any) {
      const name = String(e?.name || "");

      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermission("denied");
        setError("Camera access was denied. Please enable it in your browser settings.");
      } else if (name === "NotFoundError") {
        setError("No camera found on this device.");
      } else if (name === "OverconstrainedError") {
        setError("Camera settings not supported on this device.");
      } else {
        setError("Unable to start camera. Please try again or use Gallery.");
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      setHasFrames(false);
      setStatus("error");
    }
  }, [enabled]);

  // Read current permission (if supported) so we can auto-start when already granted.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const readPermission = async () => {
      try {
        const perms = (navigator as any).permissions;
        if (!perms?.query) {
          setPermission("prompt");
          return;
        }

        const res = await perms.query({ name: "camera" } as any);
        if (cancelled) return;

        const state = mapPermissionState(res.state);
        setPermission(state);

        res.onchange = () => {
          if (cancelled) return;
          setPermission(mapPermissionState(res.state));
        };

        if (state === "granted") {
          // If already granted, start immediately.
          start();
        }
      } catch {
        setPermission("prompt");
      }
    };

    readPermission();

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, start, stop]);

  return {
    videoRef,
    permission,
    status,
    error,
    hasFrames,
    start,
    stop,
  };
}
