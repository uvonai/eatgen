import { useNavigate } from "react-router-dom";
import { ChevronLeft, Crown, Calendar, CreditCard, ExternalLink } from "lucide-react";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import { Skeleton } from "@/components/ui/skeleton";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

const ManageSubscription = () => {
  const navigate = useNavigate();
  const { subscriptionStatus, isIOSNative, isLoading } = useRevenueCat();

  const handleManageInAppStore = () => {
    if (isIOSNative && Capacitor.getPlatform() === "ios") {
      window.open("https://apps.apple.com/account/subscriptions", "_blank");
    } else {
      toast.info("Manage your subscription in App Store settings");
    }
  };

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Header */}
      <header className="relative z-10 px-4 pb-4 flex items-center gap-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 12px)' }}>
        <button 
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-muted/30 transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-foreground" />
        </button>
        <h1 className="text-foreground text-xl font-bold tracking-tight">Manage Subscription</h1>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-10">
        {isLoading ? (
          <div className="space-y-5">
            {/* Pro Status Skeleton */}
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-amber-500/20 relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-6 w-32 bg-muted/30 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                  <div className="h-4 w-44 bg-muted/20 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                </div>
              </div>
            </div>
            {/* Details Skeleton */}
            <div className="rounded-2xl bg-card/60 border border-border/40 p-4 animate-pulse">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="flex items-center justify-between py-3">
                  <div className="h-4 w-24 bg-muted/30 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                  <div className="h-4 w-16 bg-muted/20 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Pro Status Card */}
            <div className="rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-600/20 border border-amber-500/40 p-5 mb-5 animate-scale-in">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600">
                  <Crown className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground font-bold text-xl">Eatgen Pro</h3>
                  </div>
                  <p className="text-muted-foreground text-sm">Unlimited scans & insights</p>
                </div>
                <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-500">
                  Active
                </div>
              </div>
            </div>

            {/* Subscription Details */}
            <div className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm overflow-hidden mb-5 animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="p-4 border-b border-border/30">
                <h4 className="text-foreground font-semibold">Subscription Details</h4>
              </div>
              
              {/* Plan Type */}
              <div className="flex items-center justify-between p-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                  <span className="text-foreground">Plan</span>
                </div>
                <span className="text-foreground font-medium">
                  {subscriptionStatus?.planType === "yearly" 
                    ? "Yearly" 
                    : subscriptionStatus?.planType === "monthly"
                    ? "Monthly"
                    : subscriptionStatus?.planType === "lifetime"
                    ? "Lifetime"
                    : "Pro"}
                </span>
              </div>
              
              {/* Renewal/Expiration Date */}
              {subscriptionStatus?.expirationDate && subscriptionStatus.planType !== "lifetime" && (
                <div className="flex items-center justify-between p-4 border-b border-border/30">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                    <span className="text-foreground">
                      {subscriptionStatus.willRenew ? "Renews on" : "Expires on"}
                    </span>
                  </div>
                  <span className="text-foreground font-medium">
                    {subscriptionStatus.expirationDate.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
              
              {/* Auto-renew Status */}
              {subscriptionStatus?.planType !== "lifetime" && (
                <div className="flex items-center justify-between p-4">
                  <span className="text-foreground">Auto-renew</span>
                  <span className={`font-medium ${subscriptionStatus?.willRenew ? "text-emerald-500" : "text-amber-500"}`}>
                    {subscriptionStatus?.willRenew ? "Enabled" : "Disabled"}
                  </span>
                </div>
              )}
            </div>

            {/* Manage in App Store Button */}
            <button
              onClick={handleManageInAppStore}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-base active:scale-[0.98] transition-transform animate-slide-up"
              style={{ animationDelay: '0.2s' }}
            >
              <span>Manage in App Store</span>
              <ExternalLink className="w-4 h-4" />
            </button>

            <p className="text-center text-muted-foreground text-xs mt-4 px-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              To change or cancel your subscription, you'll be redirected to your App Store account settings.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ManageSubscription;
