/**
 * Premium Skeleton Components Library
 * Consistent loading states across the app for a lightning-fast feel
 */

import { Skeleton } from "@/components/ui/skeleton";

// Meal card skeleton - matches the meal list item exactly
export const MealCardSkeleton = () => (
  <div className="w-full flex items-center justify-between p-4 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm animate-pulse">
    <div className="flex items-center gap-4">
      <Skeleton className="w-12 h-12 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
    <Skeleton className="h-6 w-16 rounded-full" />
  </div>
);

// Macro card skeleton - matches the macro cards
export const MacroCardSkeleton = () => (
  <div className="w-[100px] rounded-2xl bg-zinc-900 border border-white/[0.06] p-3 flex flex-col gap-2 animate-pulse">
    <div>
      <Skeleton className="h-6 w-12 bg-white/10" />
      <Skeleton className="h-3 w-16 mt-1 bg-white/10" />
    </div>
    <Skeleton className="w-8 h-8 rounded-full bg-white/[0.05]" />
  </div>
);

// Life score skeleton - matches the circular progress card
export const LifeScoreSkeleton = () => (
  <div className="rounded-[24px] relative overflow-hidden">
    <div className="absolute inset-0 bg-zinc-900" />
    <div className="absolute inset-0 rounded-[24px] border border-white/[0.06]" />
    <div className="relative z-10 px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-24 bg-white/10" />
          <Skeleton className="h-3 w-32 bg-white/10" />
        </div>
        <div className="w-[100px] h-[100px] rounded-full bg-white/[0.05] animate-pulse" />
      </div>
    </div>
  </div>
);

// Impact card skeleton
export const ImpactCardSkeleton = () => (
  <div className="flex-shrink-0 w-[55%] rounded-2xl bg-zinc-900 border border-white/[0.06] p-4 animate-pulse">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-xl bg-white/[0.05]" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-16 bg-white/10" />
        <Skeleton className="h-5 w-12 bg-white/10" />
        <Skeleton className="h-3 w-24 bg-white/10" />
      </div>
    </div>
  </div>
);

// Insight card skeleton
export const InsightCardSkeleton = () => (
  <div className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm p-5 animate-pulse">
    <div className="flex items-start gap-4">
      <Skeleton className="w-12 h-12 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  </div>
);

// Profile card skeleton
export const ProfileCardSkeleton = () => (
  <div className="rounded-2xl bg-card/60 border border-border/40 p-5 backdrop-blur-sm">
    <div className="flex items-center gap-4">
      <Skeleton className="w-14 h-14 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  </div>
);

// Settings menu item skeleton
export const MenuItemSkeleton = () => (
  <div className="flex items-center justify-between p-4 animate-pulse">
    <div className="flex items-center gap-4">
      <Skeleton className="w-5 h-5 rounded" />
      <Skeleton className="h-4 w-32" />
    </div>
    <Skeleton className="w-5 h-5 rounded" />
  </div>
);

// Chart skeleton
export const ChartSkeleton = ({ height = 120 }: { height?: number }) => (
  <div 
    className="w-full flex items-center justify-center animate-pulse" 
    style={{ height }}
  >
    <div className="w-full h-full bg-gradient-to-t from-emerald-500/5 to-transparent rounded-lg" />
  </div>
);

// Weekly insight row skeleton
export const WeeklyInsightSkeleton = () => (
  <div className="rounded-2xl bg-card border border-border/50 p-4 animate-pulse">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-3 w-40 mt-2" />
      </div>
      <Skeleton className="h-6 w-16" />
    </div>
  </div>
);

// Shimmer effect overlay for premium feel
export const ShimmerOverlay = () => (
  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
);

// Subscription card skeleton
export const SubscriptionCardSkeleton = () => (
  <div className="rounded-2xl bg-card/60 border border-border/40 p-5 backdrop-blur-sm animate-pulse">
    <div className="flex items-center gap-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-44" />
      </div>
      <Skeleton className="h-6 w-6 rounded-md" />
    </div>
  </div>
);
