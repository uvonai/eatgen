import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import { toast } from "sonner";
import { useRevenueCat } from "@/hooks/useRevenueCat";

interface PaywallProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribeSuccess: () => void;
}

const benefits = [
  "Unlimited food & ingredient scans",
  "Full macro breakdown",
  "Complete ingredient details",
  "Additives & preservatives detection",
  "AI-powered food insights",
  "Full scan history & tracking",
  "Vera — Your personal AI health assistant",
];

export const Paywall = ({ isOpen, onClose, onSubscribeSuccess }: PaywallProps) => {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");

  const { 
    purchase, 
    restore, 
    getPrices, 
    isIOSNative,
    isPurchasing,
    isRestoring,
    transactionStatus,
    transactionMessage,
    resetTransactionState
  } = useRevenueCat();
  const prices = getPrices();

  // Calculate savings
  const monthlyCost = 14.99;
  const yearlyCost = 59.99;
  const savings = (monthlyCost * 12 - yearlyCost).toFixed(2);

  // Reset transaction state when paywall closes
  useEffect(() => {
    if (!isOpen) {
      resetTransactionState();
    }
  }, [isOpen, resetTransactionState]);

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    if (isIOSNative) {
      // Use RevenueCat for iOS native
      const result = await purchase(selectedPlan);
      
      if (result.status === "success") {
        toast.success(result.message);
        onSubscribeSuccess();
        onClose();
      } else if (result.status === "cancelled") {
        // User cancelled - show neutral message (optional, or just do nothing)
        // toast.info(result.message);
      } else if (result.status === "pending") {
        toast.info(result.message);
      } else if (result.status === "failed") {
        toast.error(result.message);
      }
      // If still processing, do nothing (button is already disabled)
    } else {
      // Web/demo mode - simulate subscription
      console.log("Demo mode: Simulating subscription for", selectedPlan);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Welcome to Eatgen Pro! 🎉");
      onSubscribeSuccess();
      onClose();
    }
  };

  const handleRestore = async () => {
    if (isIOSNative) {
      // Use RevenueCat restore
      const result = await restore();
      
      if (result.status === "success") {
        toast.success(result.message);
        onSubscribeSuccess();
        onClose();
      } else if (result.status === "idle" && result.message === "No active subscription found") {
        toast.error(result.message);
      } else if (result.status === "failed") {
        toast.error(result.message);
      }
    } else {
      // Web/demo mode
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.error("No purchases found to restore.");
    }
  };

  // Determine if actions should be disabled
  const isProcessing = isPurchasing || isRestoring || transactionStatus === "processing";

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 overflow-hidden">
      {/* Subtle grid pattern overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Top bar: Close only */}
      <div 
        className="absolute left-0 right-0 flex items-center justify-between px-4 z-10"
        style={{ top: "calc(env(safe-area-inset-top, 12px) + 8px)" }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white active:scale-95"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Content */}
      <div
        className="h-full flex flex-col px-5"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 12px) + 60px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 12px) + 16px)",
        }}
      >
      {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent mb-2">
            Know Exactly What You Eat
          </h1>
          <p className="text-[15px] font-semibold text-white/90">
            See what your food is actually doing to your body
          </p>
        </div>

        {/* Benefits List */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="space-y-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-3">
                <Check className="h-5 w-5 text-cyan-400 flex-shrink-0" strokeWidth={2.5} />
                <span className="text-[15px] text-zinc-200">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="space-y-4 mt-6">
          {/* Plan Cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* Monthly */}
            <button
              onClick={() => setSelectedPlan("monthly")}
              className={`relative rounded-xl p-4 text-left transition-all border-2 ${
                selectedPlan === "monthly"
                  ? "bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-cyan-500"
                  : "bg-zinc-900/50 border-zinc-800"
              }`}
            >
              {selectedPlan === "monthly" && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-black" strokeWidth={3} />
                </div>
              )}
              <p className="text-sm font-medium bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-1">Monthly</p>
              <p className="text-xl font-bold text-white">{prices.monthly}</p>
              <p className="text-xs text-zinc-500 mt-0.5">per month</p>
            </button>

            {/* Yearly */}
            <button
              onClick={() => setSelectedPlan("yearly")}
              className={`relative rounded-xl p-4 text-left transition-all border-2 ${
                selectedPlan === "yearly"
                  ? "bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-cyan-500"
                  : "bg-zinc-900/50 border-zinc-800"
              }`}
            >
              {/* Save badge */}
              <div className="absolute -top-2.5 right-3 px-2 py-0.5 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded text-[10px] font-medium text-white">
                Save ${savings}
              </div>
              {selectedPlan === "yearly" && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-black" strokeWidth={3} />
                </div>
              )}
              <p className="text-sm font-medium bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-1">Yearly</p>
              <p className="text-xl font-bold text-white">{prices.yearly}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{prices.monthlyEquivalent}/month</p>
            </button>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleSubscribe}
            disabled={isProcessing}
            className="w-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500 py-4 text-base font-semibold text-black active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/25"
          >
            {isPurchasing ? "Processing..." : "Unlock Eatgen Pro"}
          </button>

          {/* Footer Links */}
          <div className="flex items-center justify-center gap-4 pt-1">
            <a 
              href="https://sites.google.com/view/eatgenai-terms" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs text-zinc-500 hover:text-white"
            >
              Terms
            </a>
            <span className="text-zinc-700">•</span>
            <a 
              href="https://sites.google.com/view/eatgen-privacy" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs text-zinc-500 hover:text-white"
            >
              Privacy
            </a>
            <span className="text-zinc-700">•</span>
            <button
              onClick={handleRestore}
              disabled={isProcessing}
              className="text-xs text-zinc-500 hover:text-white disabled:opacity-50"
            >
              {isRestoring ? "Restoring..." : "Restore"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
