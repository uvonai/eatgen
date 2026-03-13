import { useEffect, useRef, useState } from "react";

const loadingMessages = [
  "Analyzing how food affects your body",
  "Identifying hidden ingredients",
  "Calculating health impact",
  "Checking disease risk factors",
  "Finding safer alternatives",
];

type AnalyzingScreenProps = {
  /** When true, the progress will finish to 100% and then call onDone */
  done?: boolean;
  onDone?: () => void;
  title?: string;
};

export const AnalyzingScreen = ({ done = false, onDone, title = "Analyzing Your Food" }: AnalyzingScreenProps) => {
  const [progress, setProgress] = useState(0);
  const [textIndex, setTextIndex] = useState(0);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const hasCompletedRef = useRef(false);

  // Show "taking longer" message after 6 seconds
  useEffect(() => {
    const slowTimer = setTimeout(() => {
      setShowSlowMessage(true);
    }, 6000);

    return () => clearTimeout(slowTimer);
  }, []);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const target = done ? 100 : 92;
        if (prev >= target) return prev;

        // Slow down as we approach the cap, then speed up when done
        const step = done ? 4 : Math.max(0.4, (target - prev) * 0.04);
        return Math.min(target, prev + step);
      });
    }, 60);

    const textInterval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % loadingMessages.length);
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
      const t = window.setTimeout(() => onDone(), 150);
      return () => window.clearTimeout(t);
    }
  }, [done, progress, onDone]);

  const displayProgress = Math.round(progress);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-gradient-to-b from-violet-500/[0.08] via-purple-500/[0.04] to-transparent blur-[120px]" />
        <div className="absolute top-1/3 -left-24 h-[300px] w-[300px] rounded-full bg-gradient-to-br from-blue-500/[0.06] to-transparent blur-[80px]" />
        <div className="absolute top-1/2 -right-24 h-[250px] w-[250px] rounded-full bg-gradient-to-bl from-fuchsia-500/[0.05] to-transparent blur-[80px]" />
      </div>

      {/* Content - centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Progress ring */}
        <div className="relative w-40 h-40 mb-10">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-transparent blur-xl" />

          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${displayProgress * 2.83} 283`}
              className="transition-all duration-100"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-white font-display">{displayProgress}%</span>
          </div>
        </div>

        <h2 className="text-2xl font-semibold text-white text-center mb-3 font-display">{title}</h2>
        <p className="text-zinc-400 text-center text-base font-display h-6 transition-opacity duration-300">
          {loadingMessages[textIndex]}
        </p>
        
        {/* Slow loading indicator */}
        {showSlowMessage && !done && (
          <p className="mt-4 text-zinc-500 text-center text-sm font-display animate-fade-in">
            Taking longer than expected...
          </p>
        )}
      </div>

      {/* Bottom progress bar */}
      <div className="px-8 pb-12">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500 transition-all duration-100"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
