import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Sparkles, Utensils, Zap, AlertTriangle, Droplets } from "lucide-react";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { getVeraLastVisit } from "@/pages/Vera";
import { BottomNav } from "@/components/BottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocalDateKey, getWeekDates } from "@/lib/timezone-utils";
import { useDayChange } from "@/hooks/useDayChange";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useWeeklyScoreAdjustment } from "@/hooks/useWeeklyScoreAdjustment";

// Hydration helper - get cups from localStorage with timezone-aware date
const HYDRATION_CACHE_KEY = 'eatgen_hydration';
function getHydrationCups(): number {
  try {
    const cached = localStorage.getItem(HYDRATION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      const today = getLocalDateKey(); // Use timezone-aware date key
      if (parsed.date === today) {
        return parsed.cupsConsumed || 0;
      }
    }
  } catch {
    // Ignore
  }
  return 0;
}

import { useHealthData } from "@/hooks/useHealthData";
import { useDailySummary } from "@/hooks/useDailySummary";
import { CameraFAB } from "@/components/camera";
import { SecureFoodImage } from "@/components/SecureFoodImage";
import { FoodDetailView } from "@/components/FoodDetailView";
import { useAuthContext } from "@/contexts/AuthContext";
import { useOptimisticMeal } from "@/contexts/OptimisticMealContext";
import { PendingMealSkeleton } from "@/components/home/PendingMealSkeleton";
import { format } from "date-fns";
const EffectBadge = ({ effect }: { effect: string }) => {
  const styles = {
    good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    neutral: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    risky: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  };
  
  const labels = {
    good: "Good",
    neutral: "Neutral",
    risky: "Risky",
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border backdrop-blur-sm ${styles[effect as keyof typeof styles]}`}>
      {labels[effect as keyof typeof labels]}
    </span>
  );
};

// Clean Circular Progress - Apple Style
// Enforce minimum display of 65 for user motivation (per memory)
const CircularProgress = ({ value, size = 120 }: { value?: number; size?: number }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Use score directly - backend already ensures proper range
  const hasRealScore = typeof value === 'number' && Number.isFinite(value) && value > 0;
  const displayValue = hasRealScore ? value : 0;
  const safeValue = Math.max(0, Math.min(100, displayValue));
  const offset = circumference - (safeValue / 100) * circumference;

  const label = hasRealScore ? String(Math.round(displayValue)) : '—';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#scoreGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-foreground tracking-tight">{label}</span>
        <span className="text-[10px] font-medium text-muted-foreground -mt-0.5">out of 100</span>
      </div>
    </div>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { pendingMeal, clearPendingMeal } = useOptimisticMeal();
  const [activeTab, setActiveTab] = useState("home");
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMeal, setSelectedMeal] = useState<any | null>(null);
  const [hydrationCups, setHydrationCups] = useState(0);
  
  // Generate week dates from centralized utility (timezone-aware)
  const weekDates = getWeekDates();
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Fetch real health data from backend
  const { healthScore, loading: healthLoading, dataReady: healthDataReady, refetch: refetchHealthData } = useHealthData(selectedDate);

  // Fetch daily summary from backend (all calculations done on backend)
  const { meals, remainingMacros, impactCards, dataDate, loading: summaryLoading, refetch: refetchSummary } = useDailySummary(selectedDate);
  
  // Show Vera dot if there are meals scanned after last Vera visit
  const showVeraDot = useMemo(() => {
    const lastVisit = getVeraLastVisit();
    if (!lastVisit) return meals.length > 0;
    return meals.some(m => new Date(m.scanned_at) > new Date(lastVisit));
  }, [meals]);

  // Weekly score adjustment - runs once per session, adjusts score based on food choices
  useWeeklyScoreAdjustment((result) => {
    if (result.adjusted) {
      console.log(`[Home] Life Score adjusted: ${result.previousScore} -> ${result.newScore} (${result.adjustment! > 0 ? '+' : ''}${result.adjustment})`);
      // Refetch health data to show updated score
      refetchHealthData();
    }
  });
  
  // Show skeleton until data matches selected date AND fresh data is ready (prevents old data flash)
  const isDataStale = dataDate !== selectedDate.toDateString();
  const isLoading = summaryLoading || isDataStale || healthLoading || !healthDataReady;
  
  // Clear pending meal when real data arrives containing that meal
  useEffect(() => {
    if (pendingMeal && meals.length > 0) {
      // Check if a meal with similar name was just added (within last 30 seconds)
      const pendingFoodName = pendingMeal.analysis.food_name?.toLowerCase() || '';
      const recentMeal = meals.find(m => {
        const mealTime = new Date(m.scanned_at).getTime();
        const now = Date.now();
        const isRecent = now - mealTime < 30000; // Within 30 seconds
        const nameMatches = m.food_name?.toLowerCase().includes(pendingFoodName.slice(0, 10)) || 
                           pendingFoodName.includes(m.food_name?.toLowerCase().slice(0, 10) || '');
        return isRecent && nameMatches;
      });
      
      if (recentMeal) {
        clearPendingMeal();
      }
    }
  }, [meals, pendingMeal, clearPendingMeal]);
  
  // Detect day change and refresh all data (midnight or app foreground on new day)
  useDayChange(useCallback(() => {
    // Reset selected date to today when day changes
    setSelectedDate(new Date());
    // Refresh hydration
    setHydrationCups(getHydrationCups());
    // Refresh all backend data
    refetchHealthData();
    refetchSummary();
  }, [refetchHealthData, refetchSummary]));
  
  // Load hydration data on mount and when returning from hydration page
  useEffect(() => {
    const loadHydration = () => setHydrationCups(getHydrationCups());
    loadHydration();
    
    // Listen for storage changes (when hydration page updates)
    const handleStorage = () => loadHydration();
    window.addEventListener('storage', handleStorage);
    
    // Also check on focus (when returning from hydration page)
    const handleFocus = () => loadHydration();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Pull-to-refresh (touch) - stable, no stale state on touchend
  const { pullDistance, isRefreshing } = usePullToRefresh({
    containerRef: scrollContainerRef,
    onRefresh: async () => {
      await Promise.all([refetchHealthData(), refetchSummary()]);
    },
  });

  // Transform backend impact cards to include icons and styling
  const dynamicImpactCards = impactCards.map(card => {
    const icons: Record<string, any> = { food: Utensils, calories: Zap, risk: AlertTriangle };
    const colorStyles: Record<string, { gradient: string; iconBg: string; iconColor: string; borderColor: string }> = {
      emerald: {
        gradient: "from-emerald-500/20 via-emerald-500/10 to-transparent",
        iconBg: "bg-emerald-500/20",
        iconColor: "text-emerald-400",
        borderColor: "border-emerald-500/20",
      },
      amber: {
        gradient: "from-amber-500/20 via-amber-500/10 to-transparent",
        iconBg: "bg-amber-500/20",
        iconColor: "text-amber-400",
        borderColor: "border-amber-500/20",
      },
      rose: {
        gradient: "from-rose-500/20 via-rose-500/10 to-transparent",
        iconBg: "bg-rose-500/20",
        iconColor: "text-rose-400",
        borderColor: "border-rose-500/20",
      },
    };
    
    const style = colorStyles[card.color] || colorStyles.emerald;
    return {
      ...card,
      icon: icons[card.type] || Utensils,
      ...style,
    };
  });

  // Week dates are now generated at component top using centralized timezone-aware utility
  const handleScroll = () => {
    if (carouselRef.current) {
      const scrollLeft = carouselRef.current.scrollLeft;
      const cardWidth = carouselRef.current.offsetWidth * 0.75;
      const newActive = Math.round(scrollLeft / cardWidth);
      setActiveCard(newActive);
    }
  };

  // No blocking loading screen - show cached data immediately, fetch in background

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Main Content - Endless scrolling with smooth scrolling */}
      <div 
        ref={scrollContainerRef}
        className="relative z-10 flex-1 overflow-y-auto pb-40 scrollbar-hide will-change-scroll" 
        style={{ 
          WebkitOverflowScrolling: 'touch', 
          overscrollBehavior: 'contain',
        }}
      >
        {/* Pull-to-refresh indicator - inside scroll container at top */}
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {/* Header with animation */}
        <header className="px-6 pb-1" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 12px)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-foreground text-2xl font-bold">
                Eatgen AI
              </h1>
              {/* Hydration indicator in header */}
              {hydrationCups > 0 && (
                <button 
                  onClick={() => navigate('/hydration')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 active:scale-95 transition-transform"
                >
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-semibold text-cyan-400">{hydrationCups}</span>
                </button>
              )}
            </div>
            <button
              onClick={() => navigate("/daily-insights")}
              className="w-10 h-10 rounded-xl bg-card border border-border/40 flex items-center justify-center active:scale-95 transition-transform"
            >
              <Sparkles className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </header>

        {/* Week Date Selector */}
        <section className="px-4 py-3 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <div className="flex justify-between items-center">
            {weekDates.map((day, idx) => (
              <button
                key={idx}
                onClick={() => {
                  // Just set date - effect will handle skeleton state
                  setSelectedDate(day.fullDate);
                }}
                className={`flex flex-col items-center gap-1 transition-all duration-200`}
              >
                <span className={`text-xs font-medium ${
                  day.isToday && selectedDate.toDateString() === day.fullDate.toDateString()
                    ? 'text-foreground' 
                    : 'text-muted-foreground/60'
                }`}>
                  {day.dayName}
                </span>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-200 ${
                  selectedDate.toDateString() === day.fullDate.toDateString()
                    ? 'bg-foreground text-background'
                    : day.isToday 
                      ? 'border-2 border-dashed border-muted-foreground/40 text-foreground'
                      : 'border border-dashed border-muted-foreground/20 text-muted-foreground'
                }`}>
                  {day.date}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Life Score - Compact Apple Style */}
        <section className="px-5 py-2 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="rounded-[24px] relative overflow-hidden">
            {/* Clean background - Apple style */}
            <div className="absolute inset-0 bg-card" />
            
            {/* Subtle micro-gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.02] via-transparent to-foreground/[0.05]" />
            
            {/* Clean border */}
            <div className="absolute inset-0 rounded-[24px] border border-border/40" />
            
            {/* Content - Reduced padding */}
            <div className="relative z-10 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  {/* Header */}
                  <h2 className="text-foreground text-base font-semibold tracking-tight">Life Score</h2>
                  
                  {/* Description */}
                  <p className="text-muted-foreground text-xs leading-relaxed max-w-[130px]">
                    Based on today's food, energy & habits
                  </p>
                  
                </div>
                
                {/* Circular Progress - Real score from backend */}
                <CircularProgress value={isLoading ? 0 : healthScore} size={100} />
              </div>
            </div>
          </div>
        </section>

        {/* Daily Macros - Apple Style - Real Data */}
        <section className="px-5 py-2 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
            <div className="flex gap-2.5 min-w-max">
              {/* Protein */}
              <div className="w-[100px] rounded-2xl bg-card border border-border/40 p-3 flex flex-col gap-2 transition-transform duration-200 active:scale-95">
                <div>
                  {isLoading ? (
                    <div className="h-6 w-12 rounded bg-muted/30 skeleton-shimmer" />
                  ) : (
                    <span className="text-foreground text-lg font-bold">{remainingMacros.protein}g</span>
                  )}
                  <p className="text-muted-foreground text-[10px]">Protein left</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
                  <span className="text-base">🍖</span>
                </div>
              </div>

              {/* Calories */}
              <div className="w-[100px] rounded-2xl bg-card border border-border/40 p-3 flex flex-col gap-2 transition-transform duration-200 active:scale-95">
                <div>
                  {isLoading ? (
                    <div className="h-6 w-12 rounded bg-muted/30 skeleton-shimmer" />
                  ) : (
                    <span className="text-foreground text-lg font-bold">{remainingMacros.calories}</span>
                  )}
                  <p className="text-muted-foreground text-[10px]">Calories left</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
                  <span className="text-base">🔥</span>
                </div>
              </div>

              {/* Carbs */}
              <div className="w-[100px] rounded-2xl bg-card border border-border/40 p-3 flex flex-col gap-2 transition-transform duration-200 active:scale-95">
                <div>
                  {isLoading ? (
                    <div className="h-6 w-12 rounded bg-muted/30 skeleton-shimmer" />
                  ) : (
                    <span className="text-foreground text-lg font-bold">{remainingMacros.carbs}g</span>
                  )}
                  <p className="text-muted-foreground text-[10px]">Carbs left</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
                  <span className="text-base">🌾</span>
                </div>
              </div>

              {/* Fats */}
              <div className="w-[100px] rounded-2xl bg-card border border-border/40 p-3 flex flex-col gap-2 transition-transform duration-200 active:scale-95">
                <div>
                  {isLoading ? (
                    <div className="h-6 w-12 rounded bg-muted/30 skeleton-shimmer" />
                  ) : (
                    <span className="text-foreground text-lg font-bold">{remainingMacros.fat}g</span>
                  )}
                  <p className="text-muted-foreground text-[10px]">Fats left</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
                  <span className="text-base">🥑</span>
                </div>
              </div>

              {/* Fiber */}
              <div className="w-[100px] rounded-2xl bg-card border border-border/40 p-3 flex flex-col gap-2 transition-transform duration-200 active:scale-95">
                <div>
                  {isLoading ? (
                    <div className="h-6 w-12 rounded bg-muted/30 skeleton-shimmer" />
                  ) : (
                    <span className="text-foreground text-lg font-bold">{remainingMacros.fiber}g</span>
                  )}
                  <p className="text-muted-foreground text-[10px]">Fiber left</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
                  <span className="text-base">🥦</span>
                </div>
              </div>

              {/* Sugar */}
              <div className="w-[100px] rounded-2xl bg-card border border-border/40 p-3 flex flex-col gap-2 transition-transform duration-200 active:scale-95">
                <div>
                  {isLoading ? (
                    <div className="h-6 w-12 rounded bg-muted/30 skeleton-shimmer" />
                  ) : (
                    <span className="text-foreground text-lg font-bold">{remainingMacros.sugar}g</span>
                  )}
                  <p className="text-muted-foreground text-[10px]">Sugar left</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
                  <span className="text-base">🍬</span>
                </div>
              </div>

              {/* Sodium */}
              <div className="w-[100px] rounded-2xl bg-card border border-border/40 p-3 flex flex-col gap-2 transition-transform duration-200 active:scale-95">
                <div>
                  {isLoading ? (
                    <div className="h-6 w-16 rounded bg-muted/30 skeleton-shimmer" />
                  ) : (
                    <span className="text-foreground text-lg font-bold">{remainingMacros.sodium}mg</span>
                  )}
                  <p className="text-muted-foreground text-[10px]">Sodium left</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
                  <span className="text-base">🧂</span>
                </div>
              </div>

              {/* Hydration - Clickable with cup count */}
              <button
                onClick={() => navigate('/hydration')}
                className="w-[100px] rounded-2xl bg-cyan-500/10 border border-cyan-500/20 p-3 flex flex-col gap-2 text-left active:scale-95 transition-transform"
              >
                <div>
                  {hydrationCups > 0 ? (
                    <>
                      <span className="text-cyan-400 text-lg font-bold">{hydrationCups}</span>
                      <p className="text-cyan-400/70 text-[10px]">cups today</p>
                    </>
                  ) : (
                    <>
                      <span className="text-cyan-400 text-lg font-bold">💧</span>
                      <p className="text-cyan-400/70 text-[10px]">Track Water</p>
                    </>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                  {hydrationCups > 0 ? (
                    <Droplets className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <span className="text-base text-cyan-400">+</span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* Today's Impact Cards - Apple Style */}
        <section className="py-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="px-6 flex items-center justify-between mb-3">
            <h2 className="text-foreground font-semibold text-sm">Today's Impact</h2>
            <div className="flex gap-1">
              {dynamicImpactCards.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    activeCard === idx ? 'bg-foreground w-4' : 'bg-muted-foreground/30 w-1'
                  }`}
                />
              ))}
            </div>
          </div>
          
          <div 
            ref={carouselRef}
            onScroll={handleScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-6"
          >
            {dynamicImpactCards.map((card, idx) => (
              <button 
                key={card.id}
                onClick={() => {
                  if (card.type === "risk") {
                    navigate("/risk-signals");
                  }
                }}
                className={`flex-shrink-0 w-[55%] snap-center rounded-2xl bg-card border border-border/40 p-4 relative overflow-hidden transition-all duration-300 ease-out active:scale-[0.98] text-left`}
              >
                {/* Subtle gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-50`} />
                
                <div className="relative flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center border border-border/40 flex-shrink-0`}>
                    <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground text-[11px] font-medium">{card.title}</p>
                    <p className="text-foreground text-lg font-bold tracking-tight leading-tight">{card.value}</p>
                    <p className="text-muted-foreground text-[10px] truncate">{card.subtext}</p>
                  </div>
                  {card.type === "risk" && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Today's Log */}
        <section className="px-6 py-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-foreground font-bold text-base mb-4">Today's Log</h2>
          
          {isLoading && !pendingMeal ? (
            // Premium skeleton loading with stagger effect and shimmer
            <div className="space-y-3">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm animate-fade-in"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl skeleton-shimmer" />
                    <div className="space-y-2">
                      <div className="h-4 w-28 rounded skeleton-shimmer" />
                      <div className="h-3 w-20 rounded skeleton-shimmer" />
                    </div>
                  </div>
                  <div className="h-6 w-16 rounded-full skeleton-shimmer" />
                </div>
              ))}
            </div>
          ) : meals.length === 0 && !pendingMeal ? (
            <div className="rounded-2xl bg-card/60 border border-border/40 p-6 flex flex-col items-center justify-center animate-scale-in">
              {/* Food illustration */}
              <div className="w-20 h-20 rounded-2xl bg-muted/20 flex items-center justify-center mb-4">
                <span className="text-4xl">🥗</span>
              </div>
              
              {/* Empty state text */}
              <p className="text-muted-foreground text-sm text-center">
                Tap on camera icon to add your first meal of the day
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Pending meal skeleton at the top */}
              <PendingMealSkeleton />
              
              {/* Actual meals */}
              {meals.map((meal, idx) => (
                <button
                  key={meal.id}
                  onClick={() => setSelectedMeal(meal)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm hover:bg-card/80 transition-all duration-200 ease-out group active:scale-[0.98] text-left animate-slide-up"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-4">
                    {/* Show actual food image if available, otherwise show emoji */}
                    {meal.image_url && meal.image_url.trim() !== '' ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted/30 flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                        <SecureFoodImage
                          src={meal.image_url}
                          alt={meal.food_name || "Food"}
                          className="w-full h-full object-cover"
                          fallback={
                            <span className="text-2xl flex items-center justify-center w-full h-full">🍽️</span>
                          }
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform duration-200 ease-out flex-shrink-0">
                        {meal.health_impact === "good" ? "🥗" : meal.health_impact === "risky" ? "🍔" : "🍽️"}
                      </div>
                    )}
                    <div>
                      <span className="text-foreground font-medium block">{meal.food_name}</span>
                      <span className="text-muted-foreground text-xs">
                        {format(new Date(meal.scanned_at), "h:mm a")} • {meal.calories} kcal
                      </span>
                    </div>
                  </div>
                  <EffectBadge effect={meal.health_impact} />
                </button>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Food Detail View Modal */}
      {selectedMeal && (
        <FoodDetailView 
          meal={selectedMeal} 
          onClose={() => setSelectedMeal(null)} 
        />
      )}

      {/* Camera FAB */}
      <CameraFAB 
        onMealSaved={() => { refetchSummary(); refetchHealthData(); }} 
        refreshDataAsync={async () => {
          await Promise.all([refetchSummary(), refetchHealthData()]);
        }}
      />

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} showVeraDot={showVeraDot} />
    </div>
  );
};

export default Home;
