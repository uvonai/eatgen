import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Droplets, Plus, Minus, Check } from "lucide-react";
import { getLocalDateKey } from "@/lib/timezone-utils";

const HYDRATION_CACHE_KEY = 'eatgen_hydration';

interface HydrationData {
  cupsConsumed: number;
  date: string;
}

function getHydrationData(): HydrationData {
  try {
    const cached = localStorage.getItem(HYDRATION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      const today = getLocalDateKey();
      if (parsed.date === today) {
        return parsed;
      }
    }
  } catch {
    // Ignore
  }
  return { cupsConsumed: 0, date: getLocalDateKey() };
}

function saveHydrationData(data: HydrationData) {
  try {
    localStorage.setItem(HYDRATION_CACHE_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event('storage'));
  } catch {
    // Ignore
  }
}

const Hydration = () => {
  const navigate = useNavigate();
  const [cupsConsumed, setCupsConsumed] = useState(0);
  
  const dailyGoalCups = 8;
  const cupsRemaining = Math.max(0, dailyGoalCups - cupsConsumed);
  const progress = Math.min(100, (cupsConsumed / dailyGoalCups) * 100);
  
  useEffect(() => {
    const data = getHydrationData();
    setCupsConsumed(data.cupsConsumed);
  }, []);
  
  const handleAddCup = () => {
    const newCount = cupsConsumed + 1;
    setCupsConsumed(newCount);
    saveHydrationData({ cupsConsumed: newCount, date: getLocalDateKey() });
  };
  
  const handleRemoveCup = () => {
    const newCount = Math.max(0, cupsConsumed - 1);
    setCupsConsumed(newCount);
    saveHydrationData({ cupsConsumed: newCount, date: getLocalDateKey() });
  };

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Header */}
      <header 
        className="relative z-10 px-5 pb-3 flex items-center gap-4 flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 12px)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-foreground text-lg font-semibold">Stay Hydrated</h1>
      </header>
      
      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide will-change-scroll px-5 pb-8" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {/* Water Icon & Progress */}
        <div className="flex flex-col items-center py-8">
          <div className="relative">
            <svg width="180" height="180" viewBox="0 0 180 180">
              <circle
                cx="90"
                cy="90"
                r="85"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="8"
              />
              <circle
                cx="90"
                cy="90"
                r="85"
                fill="none"
                stroke="url(#waterGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 85}
                strokeDashoffset={2 * Math.PI * 85 * (1 - progress / 100)}
                transform="rotate(-90 90 90)"
                className="transition-all duration-500"
              />
              <defs>
                <linearGradient id="waterGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>
            </svg>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Droplets className="w-8 h-8 text-cyan-400 mb-1" />
              <span className="text-3xl font-bold text-foreground">{cupsConsumed}</span>
              <span className="text-muted-foreground text-xs">of {dailyGoalCups} cups</span>
            </div>
          </div>
          
          <p className="text-muted-foreground text-sm mt-6 text-center max-w-[250px]">
            {cupsRemaining === 0 
              ? "🎉 Great job! You've met your daily goal!"
              : `${cupsRemaining} more cup${cupsRemaining !== 1 ? 's' : ''} to reach your daily goal`
            }
          </p>
        </div>
        
        {/* Info Card */}
        <div className="rounded-2xl bg-card border border-border/40 p-4 mb-6">
          <h3 className="text-foreground text-sm font-semibold mb-2 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-400" />
            Daily Water Goal
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Based on general health guidelines, aim for <span className="text-cyan-400 font-medium">8 cups (2 liters)</span> of water daily. 
            This helps maintain energy, supports digestion, and keeps your skin healthy.
          </p>
        </div>
        
        {/* Add/Remove Buttons */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleRemoveCup}
            disabled={cupsConsumed === 0}
            className="flex-1 py-4 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-30"
          >
            <Minus className="w-5 h-5 text-foreground" />
            <span className="text-foreground font-medium text-sm">Remove Cup</span>
          </button>
          <button
            onClick={handleAddCup}
            className="flex-1 py-4 rounded-2xl bg-cyan-500 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <Plus className="w-5 h-5 text-black" />
            <span className="text-black font-semibold text-sm">Add Cup</span>
          </button>
        </div>
        
        {/* Quick Tips */}
        <div className="rounded-2xl bg-muted/20 border border-border/40 p-4">
          <h3 className="text-foreground text-sm font-semibold mb-3">Hydration Tips</h3>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-cyan-400 mt-0.5" />
              <p className="text-muted-foreground text-xs">Start your day with a glass of water</p>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-cyan-400 mt-0.5" />
              <p className="text-muted-foreground text-xs">Carry a water bottle with you</p>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-cyan-400 mt-0.5" />
              <p className="text-muted-foreground text-xs">Drink water before each meal</p>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-cyan-400 mt-0.5" />
              <p className="text-muted-foreground text-xs">Set reminders throughout the day</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hydration;