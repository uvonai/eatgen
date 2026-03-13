import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Star, CheckCircle, ArrowUp, Zap, Target, Award } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { Skeleton } from "@/components/ui/skeleton";
import { useProgressData } from "@/hooks/useProgressData";
import { useHealthData } from "@/hooks/useHealthData";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useWeeklyScoreAdjustment } from "@/hooks/useWeeklyScoreAdjustment";

const timeRanges = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "6m", label: "6 Months" },
  { key: "1y", label: "1 Year" },
];

// Simple Line Chart Component
const LineChart = ({ data, height = 120, hasRealData = false }: { data: number[]; height?: number; hasRealData?: boolean }) => {
  // If no real data, show empty state
  if (!hasRealData || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        Start logging meals to see your trend
      </div>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 80 - 10;
    return `${x},${y}`;
  }).join(" ");

  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        
        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill="url(#chartGradient)"
        />
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* End dot */}
        {data.length > 0 && (
          <circle
            cx={100}
            cy={100 - ((data[data.length - 1] - min) / range) * 80 - 10}
            r="3"
            fill="#34d399"
            className="animate-pulse"
          />
        )}
      </svg>
    </div>
  );
};

const Progress = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("progress");
  const [timeRange, setTimeRange] = useState("7d");
  const { chartData, weeklyInsights, monthlyChange, highlights, loading, dataReady, refetch } = useProgressData();
  // Use the same health score source as Home page for consistency
  const { healthScore, loading: healthLoading, dataReady: healthDataReady, refetch: refetchHealthData } = useHealthData();
  
  // Weekly score adjustment - runs once per session, adjusts score based on food choices
  useWeeklyScoreAdjustment((result) => {
    if (result.adjusted) {
      console.log(`[Progress] Life Score adjusted: ${result.previousScore} -> ${result.newScore}`);
      // Refetch health data to show updated score
      refetchHealthData();
      refetch();
    }
  });
  
  // Show loading until BOTH hooks have fresh data ready
  const isLoading = loading || healthLoading || !dataReady || !healthDataReady;

  // Pull-to-refresh using the shared hook with native listeners
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { pullDistance, isRefreshing } = usePullToRefresh({
    containerRef: scrollContainerRef,
    onRefresh: async () => {
      await Promise.all([refetch(), refetchHealthData()]);
    },
    enabled: true,
  });

  // Check if user has any real data logged
  const hasRealData = monthlyChange.meals > 0;
  const hasEnoughMonthlyData = monthlyChange.meals >= 5;

  const formatWeekday = (value: string) => {
    const map: Record<string, string> = {
      Mon: "Monday",
      Tue: "Tuesday",
      Wed: "Wednesday",
      Thu: "Thursday",
      Fri: "Friday",
      Sat: "Saturday",
      Sun: "Sunday",
    };
    return map[value] || value;
  };

  const getConsistencyLabel = (raw: string) => {
    const v = (raw || "").trim().toLowerCase();
    if (!v || v === "—" || v === "0%") return "Getting Started";
    if (v === "low") return "Getting Started";
    if (v === "medium") return "Building";
    if (v === "high") return "Strong";
    if (v === "excellent") return "Excellent";
    return raw;
  };

  // Weekly insights: Use actual healthScore from Home for consistency
  const dynamicWeeklyInsights = [
    {
      title: "Weekly Life Score",
      // Use the same healthScore that Home displays for consistency
      value: hasRealData && healthScore > 0 ? `${Math.round(healthScore)} / 100` : "—",
      subtext: hasRealData && healthScore > 0
        ? healthScore >= 75 ? "Great job! Keep making healthy choices" : "You're doing okay — small changes can push this higher"
        : "Scan a few meals to calculate this",
      icon: TrendingUp,
      color: "emerald",
    },
    {
      title: "Best Day",
      value: hasRealData ? formatWeekday(weeklyInsights.bestDay || "") : "—",
      subtext: hasRealData ? "Your healthiest food choices were on this day" : "Not enough data yet",
      icon: Star,
      color: "amber",
    },
    {
      title: "Consistency",
      value: hasRealData ? getConsistencyLabel(weeklyInsights.consistency || "") : "Getting Started",
      subtext: "Scan meals more often to improve this",
      icon: CheckCircle,
      color: "cyan",
    },
  ];

  const dynamicMonthlyComparisons = [
    {
      label: "Life Score",
      change: hasRealData
        ? (monthlyChange.score >= 0 ? `+${monthlyChange.score}` : String(monthlyChange.score))
        : "—",
      helper: hasRealData ? "More scans = visible improvement" : "Start scanning daily to unlock insights",
      icon: TrendingUp,
      positive: true,
    },
    {
      label: "Meals Logged",
      change: hasRealData ? String(monthlyChange.meals) : "0",
      helper: hasRealData ? "Tracking builds better insights" : "Start scanning daily to unlock insights",
      icon: Zap,
      positive: true,
    },
    {
      label: "Healthy %",
      change: hasRealData && hasEnoughMonthlyData ? `${monthlyChange.healthyPercentage}%` : "—",
      helper: hasRealData && hasEnoughMonthlyData ? "Based on your logged meals" : "Not enough data yet",
      icon: Target,
      positive: hasRealData && hasEnoughMonthlyData ? monthlyChange.healthyPercentage >= 50 : true,
    },
  ];

  const dynamicHighlights = hasRealData
    ? highlights.map((text, idx) => ({
        text,
        icon: ["🥗", "⚡", "📈", "🎯"][idx] || "✨",
      }))
    : [
        { text: "Start scanning meals to track your progress", icon: "📱" },
        { text: "Scan consistently for 7 days to unlock stronger insights", icon: "🎯" },
      ];

  // No blocking loading screen - show cached data immediately, fetch in background

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Main Content */}
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
        {/* Header */}
        <header className="px-6 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 12px)' }}>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Your Life Progress</h1>
          <p className="text-muted-foreground text-sm mt-1">
            How your daily food choices affect your health
          </p>
        </header>

        {/* Life Score Trend Card */}
        <section className="px-5 py-3">
          <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-foreground text-base font-semibold">Life Score Trend</h2>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Based on food, consistency & habits
                  </p>
                </div>
                {hasRealData && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10">
                    <ArrowUp className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-500 text-xs font-medium">
                      {monthlyChange.score >= 0 ? `+${monthlyChange.score}%` : `${monthlyChange.score}%`}
                    </span>
                  </div>
                )}
              </div>

              {/* Time Range Tabs */}
              <div className="flex gap-1.5 mb-4">
                {timeRanges.map((range) => (
                  <button
                    key={range.key}
                    onClick={() => setTimeRange(range.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      timeRange === range.key
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>

              {/* Chart */}
              {isLoading ? (
                <div className="w-full relative overflow-hidden rounded-lg" style={{ height: 120 }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent" />
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
                </div>
              ) : (
                <LineChart 
                  data={chartData[timeRange as keyof typeof chartData] || []} 
                  height={120} 
                  hasRealData={hasRealData}
                />
              )}

              <p className="text-muted-foreground text-xs mt-3 text-center">
                Score improves with regular meal scans & healthier choices
              </p>
            </div>
          </div>
        </section>

        {/* Weekly Insights */}
        <section className="px-5 py-3">
          <h2 className="text-foreground font-semibold text-base mb-3 px-1">Weekly Insights</h2>

          <div className="space-y-2">
            {isLoading ? (
              // Premium skeleton loading with shimmer
              <>
                {[0, 1, 2].map((idx) => (
                  <div 
                    key={idx} 
                    className="rounded-2xl bg-card border border-border/50 p-4 animate-pulse"
                    style={{ animationDelay: `${idx * 0.1}s` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 rounded-xl bg-muted/30 relative overflow-hidden">
                            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                          </div>
                          <div className="h-4 w-24 bg-muted/30 rounded relative overflow-hidden">
                            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                          </div>
                        </div>
                        <div className="h-3 w-40 mt-2 bg-muted/20 rounded relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        </div>
                      </div>
                      <div className="h-6 w-16 bg-muted/30 rounded relative overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              dynamicWeeklyInsights.map((insight, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl bg-card border border-border/50 p-4 animate-slide-up"
                  style={{ animationDelay: `${idx * 0.08}s` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-xl bg-muted/20 flex items-center justify-center shrink-0">
                          <insight.icon
                            className={`w-4 h-4 ${
                              insight.color === "emerald"
                                ? "text-emerald-500"
                                : insight.color === "amber"
                                  ? "text-amber-500"
                                  : "text-cyan-500"
                            }`}
                          />
                        </div>
                        <p className="text-foreground text-sm font-semibold leading-tight truncate">
                          {insight.title}
                        </p>
                      </div>

                      <p className="text-muted-foreground text-xs mt-2 leading-snug">
                        {insight.subtext}
                      </p>
                    </div>

                    <p className="text-foreground text-xl font-bold whitespace-nowrap leading-none mt-1">
                      {insight.value}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Monthly Progress */}
        <section className="px-5 py-3">
          <h2 className="text-foreground font-semibold text-base mb-3">Monthly Progress</h2>
          <div className="rounded-xl bg-card border border-border/50 p-4">
            <p className="text-muted-foreground text-xs mb-3">This month vs last month</p>
            <div className="space-y-3">
              {isLoading ? (
                // Premium skeleton with shimmer
                <>
                  {[0, 1, 2].map((idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between animate-pulse"
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-muted/30 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        </div>
                        <div>
                          <div className="h-4 w-20 mb-1 bg-muted/30 rounded relative overflow-hidden">
                            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                          </div>
                          <div className="h-3 w-32 bg-muted/20 rounded relative overflow-hidden">
                            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                          </div>
                        </div>
                      </div>
                      <div className="h-5 w-10 bg-muted/30 rounded relative overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                dynamicMonthlyComparisons.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg ${item.positive ? 'bg-emerald-500/10' : 'bg-rose-500/10'} flex items-center justify-center`}>
                        <item.icon className={`w-4 h-4 ${item.positive ? 'text-emerald-500' : 'text-rose-500'}`} />
                      </div>
                      <div>
                        <p className="text-foreground text-sm font-medium">{item.label}</p>
                        <p className="text-muted-foreground text-[10px]">{(item as any).helper}</p>
                      </div>
                    </div>
                    <span className={`${item.positive ? 'text-emerald-500' : 'text-rose-500'} font-semibold text-sm`}>{item.change}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* How to improve */}
        <section className="px-5 py-3">
          <div className="rounded-xl bg-card border border-border/50 p-4">
            <h2 className="text-foreground font-semibold text-base">How to improve your Life Score</h2>
            <ul className="mt-3 space-y-2 text-foreground text-sm">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Scan every meal</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Track consistently</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Choose foods with better nutrition</span>
              </li>
            </ul>
            <button
              onClick={() => navigate('/home')}
              className="mt-4 w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background active:scale-[0.98] transition-transform"
            >
              Scan a Meal
            </button>
          </div>
        </section>

        {/* Recent Highlights */}
        <section className="px-5 py-3">
          <div className="space-y-2">
            {dynamicHighlights.map((highlight, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50"
              >
                <div className="w-9 h-9 rounded-lg bg-muted/20 flex items-center justify-center text-lg">
                  {highlight.icon}
                </div>
                <p className="text-foreground text-sm font-medium flex-1">{highlight.text}</p>
                {hasRealData && <Award className="w-4 h-4 text-amber-500" />}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Progress;
