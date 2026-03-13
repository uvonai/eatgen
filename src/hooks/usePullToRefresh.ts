import { useEffect, useRef, useState, useCallback, type RefObject } from "react";

type PullToRefreshOptions = {
  containerRef: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
  thresholdPx?: number;
  maxPullPx?: number;
};

/**
 * Clean pull-to-refresh hook.
 * Returns pullDistance (0–maxPull) and isRefreshing.
 * Does NOT translate content — the indicator is rendered independently.
 */
export function usePullToRefresh({
  containerRef,
  onRefresh,
  enabled = true,
  thresholdPx = 60,
  maxPullPx = 120,
}: PullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { refreshingRef.current = isRefreshing; }, [isRefreshing]);

  const reset = useCallback(() => {
    setPullDistance(0);
    pullingRef.current = false;
    startYRef.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      // Only start if scrolled to top
      if (el.scrollTop <= 1) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (!startYRef.current) return;
      if (e.touches.length !== 1) return;

      // If user scrolled away from top, cancel
      if (el.scrollTop > 1) {
        reset();
        return;
      }

      const dy = e.touches[0].clientY - startYRef.current;

      if (dy > 8) {
        // Pulling down
        pullingRef.current = true;
        e.preventDefault();
        // Rubber-band resistance
        const pull = Math.min(dy * 0.45, maxPullPx);
        setPullDistance(pull);
      } else if (dy < -5) {
        // Scrolling up, cancel
        reset();
      }
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current || refreshingRef.current) {
        reset();
        return;
      }

      // Read current pull from DOM to avoid stale closure
      const currentPull = pullingRef.current;

      // Get the actual pull value - use a ref trick
      let shouldRefresh = false;
      setPullDistance((prev) => {
        shouldRefresh = prev >= thresholdPx;
        return prev;
      });

      // Small delay to let setState flush
      await new Promise(r => setTimeout(r, 0));

      if (shouldRefresh) {
        setIsRefreshing(true);
        refreshingRef.current = true;
        setPullDistance(50); // Hold at indicator position

        try {
          await onRefreshRef.current();
        } catch {
          // swallow
        } finally {
          setIsRefreshing(false);
          refreshingRef.current = false;
          reset();
        }
      } else {
        reset();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", () => reset(), { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", () => reset());
    };
  }, [containerRef, enabled, maxPullPx, thresholdPx, reset]);

  return { pullDistance, isRefreshing };
}
