import { useRef, useEffect, useCallback } from "react";

interface ScrollableMeterProps {
  items: { value: string; label: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  suffix?: string;
}

export function ScrollableMeter({
  items,
  selectedValue,
  onSelect,
  suffix = "",
}: ScrollableMeterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 48;
  const visibleItems = 5;
  const centerOffset = Math.floor(visibleItems / 2);

  const scrollToValue = useCallback((value: string, smooth = false) => {
    const index = items.findIndex((item) => item.value === value);
    if (index !== -1 && containerRef.current) {
      const scrollTop = index * itemHeight;
      containerRef.current.scrollTo({
        top: scrollTop,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, [items, itemHeight]);

  useEffect(() => {
    if (selectedValue) {
      scrollToValue(selectedValue, false);
    }
  }, [selectedValue, scrollToValue]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const selectedIndex = Math.round(scrollTop / itemHeight);
    const clampedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));
    
    if (items[clampedIndex] && items[clampedIndex].value !== selectedValue) {
      onSelect(items[clampedIndex].value);
    }
  };

  const handleItemClick = (value: string) => {
    onSelect(value);
    scrollToValue(value, true);
  };

  return (
    <div className="relative h-[240px]">
      {/* Gradient overlays */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-black to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-black to-transparent" />
      
      {/* Selection indicator */}
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-5 -translate-y-1/2 h-[48px] rounded-lg bg-white/10" />

      {/* Scrollable container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        style={{
          paddingTop: `${centerOffset * itemHeight}px`,
          paddingBottom: `${centerOffset * itemHeight}px`,
        }}
      >
        {items.map((item, index) => {
          const isSelected = item.value === selectedValue;
          const selectedIndex = items.findIndex((i) => i.value === selectedValue);
          const distance = Math.abs(index - selectedIndex);
          
          return (
            <div
              key={item.value}
              onClick={() => handleItemClick(item.value)}
              className={`flex h-[48px] cursor-pointer items-center justify-center snap-center transition-all duration-200 ${
                isSelected
                  ? "text-white font-semibold scale-100"
                  : distance === 1
                  ? "text-zinc-400 scale-95"
                  : "text-zinc-600 scale-90"
              }`}
            >
              <span className="font-display text-[18px] tracking-wide">
                {item.label}{suffix && isSelected ? ` ${suffix}` : suffix ? ` ${suffix}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
