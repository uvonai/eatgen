import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, TrendingUp, Settings, Eye } from "lucide-react";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import { Paywall } from "@/components/Paywall";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  showVeraDot?: boolean;
}

const tabs = [
  { id: "home", icon: Home, label: "Home", path: "/home" },
  { id: "progress", icon: TrendingUp, label: "Progress", path: "/progress" },
  { id: "vera", icon: Eye, label: "Vera", path: "/vera" },
  { id: "settings", icon: Settings, label: "Settings", path: "/settings" },
];

export function BottomNav({ activeTab, onTabChange, showVeraDot = false }: BottomNavProps) {
  const navigate = useNavigate();
  const { isPro, isIOSNative, refreshEntitlements, isLoading, isInitialized } = useRevenueCat();
  const [showPaywall, setShowPaywall] = useState(false);

  const handleTabClick = (tab: typeof tabs[0]) => {
    // Gate Vera behind premium on iOS native — but only after RevenueCat has initialized
    if (tab.id === "vera" && isIOSNative && !isPro && !isLoading && isInitialized) {
      setShowPaywall(true);
      return;
    }
    onTabChange(tab.id);
    navigate(tab.path);
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/50"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
      >
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className="relative flex flex-col items-center gap-1 px-6 py-1.5 transition-all duration-200"
            >
              <div className="relative">
                <tab.icon
                  className={`w-6 h-6 transition-colors duration-200 ${
                    activeTab === tab.id ? "text-foreground" : "text-muted-foreground/60"
                  }`}
                  strokeWidth={activeTab === tab.id ? 2 : 1.5}
                />
                {tab.id === "vera" && showVeraDot && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-200 ${
                  activeTab === tab.id ? "text-foreground" : "text-muted-foreground/60"
                }`}
              >
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </nav>

      <Paywall
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribeSuccess={async () => {
          if (isIOSNative) await refreshEntitlements();
          setShowPaywall(false);
          onTabChange("vera");
          navigate("/vera");
        }}
      />
    </>
  );
}
