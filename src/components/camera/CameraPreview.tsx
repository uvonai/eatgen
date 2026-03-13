import { X, Check } from "lucide-react";

interface CameraPreviewProps {
  image: string;
  onRetake: () => void;
  onAnalyze: () => void;
  onClose: () => void;
}

export const CameraPreview = ({ image, onRetake, onAnalyze, onClose }: CameraPreviewProps) => {
  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center"
          aria-label="Close preview"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        <h2 className="text-white font-semibold text-lg">Is this correct?</h2>

        <div className="w-10" />
      </header>

      {/* Image preview */}
      <main className="flex-1 px-4 pb-4 overflow-hidden flex items-center justify-center">
        <div className="w-full max-w-sm aspect-square rounded-3xl overflow-hidden">
          <img
            src={image}
            alt="Captured food photo for analysis"
            className="w-full h-full object-cover"
            loading="eager"
          />
        </div>
      </main>

      {/* Bottom actions - Wrong/Right icons */}
      <footer
        className="px-6 pb-6 flex items-center justify-center gap-16"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
      >
        {/* Wrong - Retake */}
        <button
          onClick={onRetake}
          className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Retake photo"
        >
          <X className="w-8 h-8 text-rose-500" />
        </button>

        {/* Right - Analyze */}
        <button
          onClick={onAnalyze}
          className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Confirm and analyze"
        >
          <Check className="w-8 h-8 text-emerald-500" />
        </button>
      </footer>
    </div>
  );
};
