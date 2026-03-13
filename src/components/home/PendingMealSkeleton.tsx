import { useOptimisticMeal } from "@/contexts/OptimisticMealContext";

/**
 * Premium skeleton for a meal being saved in the background
 * Shows at the top of Today's Log while saving completes
 */
export function PendingMealSkeleton() {
  const { pendingMeal } = useOptimisticMeal();

  if (!pendingMeal) return null;

  const { analysis, imagePreviewUrl } = pendingMeal;

  return (
    <div className="w-full flex items-center justify-between p-4 rounded-2xl bg-card/60 border border-border backdrop-blur-sm relative overflow-hidden animate-scale-in">
      {/* Subtle shimmer overlay */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 -translate-x-full animate-shimmer-fast bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
      </div>
      
      <div className="flex items-center gap-4 relative z-10">
        {/* Image preview with loading overlay */}
        {imagePreviewUrl ? (
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted/30 flex-shrink-0 relative animate-pulse-soft">
            <img 
              src={imagePreviewUrl} 
              alt="Saving..." 
              className="w-full h-full object-cover"
            />
            {/* Spinning loader overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
              <div className="w-5 h-5 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin" />
            </div>
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center relative overflow-hidden flex-shrink-0 skeleton-shimmer">
            <span className="text-2xl opacity-50">🍽️</span>
          </div>
        )}
        
        <div className="space-y-1.5">
          {/* Food name with subtle pulse */}
          <div className="relative">
            <span className="text-foreground/90 font-medium block text-sm animate-pulse-soft">
              {analysis.food_name || "Adding meal..."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Saving • {analysis.calories || 0} kcal
            </span>
            {/* Micro spinner */}
            <div className="w-3 h-3 border border-muted-foreground/50 border-t-foreground rounded-full animate-spin" />
          </div>
        </div>
      </div>
      
      {/* Animated saving badge */}
      <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold border backdrop-blur-sm bg-muted/50 text-foreground border-border relative z-10 animate-pulse-soft flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" />
        Saving
      </span>
    </div>
  );
}
