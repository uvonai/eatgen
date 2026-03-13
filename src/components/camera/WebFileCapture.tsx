import { useRef } from "react";
import { X, Images } from "lucide-react";

interface WebFileCaptureProps {
  onClose: () => void;
  onCaptureFile: (file: File) => void;
  onGalleryFile: (file: File) => void;
}

export function WebFileCapture({ onClose, onCaptureFile, onGalleryFile }: WebFileCaptureProps) {
  const captureInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-[200] bg-black overflow-hidden flex flex-col">
      {/* Hidden file inputs (required: browser strategy uses file input + capture) */}
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) onCaptureFile(file);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) onGalleryFile(file);
        }}
      />

      {/* Top safe area with close button */}
      <header
        className="relative z-20 flex items-center px-4 pt-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
      >
        <button
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-all"
          aria-label="Close camera"
        >
          <X className="h-5 w-5 text-white" />
        </button>
        <h1 className="flex-1 text-center text-white font-semibold text-base pr-10">Scan Food</h1>
      </header>

      {/* Center content - Scan frame */}
      <main className="flex-1 flex items-center justify-center relative z-10">
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
        </div>
      </main>

      {/* Bottom controls */}
      <footer className="relative z-20 pb-4" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}>
        <div className="flex items-center justify-center px-8">
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="absolute left-8 h-12 w-12 rounded-xl bg-white/10 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-all"
            aria-label="Open gallery"
          >
            <Images className="h-5 w-5 text-white" />
          </button>

          <button
            onClick={() => captureInputRef.current?.click()}
            className="group active:scale-90 transition-all"
            aria-label="Capture photo"
          >
            <div className="relative flex items-center justify-center">
              <div className="h-[72px] w-[72px] rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="h-[58px] w-[58px] rounded-full bg-white group-active:bg-white/80 transition-colors" />
              </div>
            </div>
          </button>

          <div className="absolute right-8 w-12" />
        </div>
      </footer>
    </div>
  );
}
