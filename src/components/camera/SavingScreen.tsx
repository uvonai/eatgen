import { useEffect, useRef, useState } from "react";

const savingMessages = [
  "Saving your meal",
  "Updating nutrition data",
  "Refreshing dashboard",
  "Almost done",
];

type SavingScreenProps = {
  /** When true, the progress will finish to 100% and then call onDone */
  done?: boolean;
  onDone?: () => void;
};

export const SavingScreen = ({ done = false, onDone }: SavingScreenProps) => {
  const [progress, setProgress] = useState(0);
  const [textIndex, setTextIndex] = useState(0);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const target = done ? 100 : 85;
        if (prev >= target) return prev;

        // Slow down as we approach the cap, then speed up when done
        const step = done ? 8 : Math.max(0.5, (target - prev) * 0.05);
        return Math.min(target, prev + step);
      });
    }, 50);

    const textInterval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % savingMessages.length);
    }, 1200);

    return () => {
      clearInterval(progressInterval);
      clearInterval(textInterval);
    };
  }, [done]);

  useEffect(() => {
    if (!done) return;
    if (!onDone) return;
    if (hasCompletedRef.current) return;

    if (progress >= 100) {
      hasCompletedRef.current = true;
      const t = window.setTimeout(() => onDone(), 100);
      return () => window.clearTimeout(t);
    }
  }, [done, progress, onDone]);

  const displayProgress = Math.round(progress);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background">
      {/* Apple-style minimal spinner */}
      <div className="relative w-16 h-16 mb-6">
        {/* Track circle */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle 
            cx="50" 
            cy="50" 
            r="42" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="6"
            className="text-muted/20"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${displayProgress * 2.64} 264`}
            className="text-foreground transition-all duration-100"
          />
        </svg>
      </div>

      {/* Status text */}
      <p className="text-foreground text-base font-medium text-center mb-1">
        {savingMessages[textIndex]}
      </p>
      <p className="text-muted-foreground text-sm text-center">
        {displayProgress}%
      </p>
    </div>
  );
};
