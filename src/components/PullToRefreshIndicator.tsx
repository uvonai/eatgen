import React from "react";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
}

/**
 * Clean, consistent pull-to-refresh spinner indicator.
 * Renders at the top of the page, above content.
 */
export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullDistance,
  isRefreshing,
}) => {
  if (pullDistance <= 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / 60, 1);
  const showSpinner = isRefreshing || progress >= 1;

  return (
    <div
      className="w-full flex items-center justify-center pointer-events-none overflow-hidden"
      style={{
        height: isRefreshing ? 48 : Math.min(pullDistance, 60),
        transition: pullDistance === 0 ? "height 0.3s cubic-bezier(0.25, 1, 0.5, 1)" : "none",
      }}
    >
      <div
        className={`w-7 h-7 rounded-full border-2 border-muted-foreground/30 border-t-foreground ${
          showSpinner ? "animate-spin" : ""
        }`}
        style={{
          opacity: Math.min(progress * 1.5, 1),
          transform: !showSpinner ? `rotate(${pullDistance * 5}deg) scale(${0.5 + progress * 0.5})` : undefined,
          transition: pullDistance === 0 ? "all 0.3s ease-out" : undefined,
        }}
      />
    </div>
  );
};
