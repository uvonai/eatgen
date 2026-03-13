import { useState, useCallback } from "react";
import { X, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AnalyzingScreen } from "./AnalyzingScreen";
import { SavingScreen } from "./SavingScreen";
import { AnalysisResults } from "./AnalysisResults";
import { FoodAnalysis } from "@/hooks/useFoodAnalysis";
import { supabase } from "@/integrations/supabase/client";

interface DescribeFoodScannerProps {
  onClose: (saved?: boolean) => void;
  /** Function that refreshes all data and returns a Promise that resolves when data is ready */
  refreshDataAsync?: () => Promise<void>;
}

type DescribeState = "input" | "analyzing" | "results" | "saving";

export const DescribeFoodScanner = ({ onClose, refreshDataAsync }: DescribeFoodScannerProps) => {
  const [state, setState] = useState<DescribeState>("input");
  const [foodName, setFoodName] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [analysisData, setAnalysisData] = useState<FoodAnalysis | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [savingComplete, setSavingComplete] = useState(false);

  const handleClose = useCallback((saved?: boolean) => {
    onClose(saved);
  }, [onClose]);

  const handleAnalyze = useCallback(async () => {
    if (!foodName.trim()) {
      toast.error("Please describe what food you're eating");
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisReady(false);
      setState("analyzing");

      // Call the describe-food edge function
      const { data, error } = await supabase.functions.invoke("describe-food", {
        body: {
          foodDescription: foodName.trim(),
          servingSize: servingSize.trim() || "1 serving",
        },
      });

      if (error) {
        console.error("Describe food error:", error);
        toast.error("Failed to analyze food. Please try again.");
        setState("input");
        setIsAnalyzing(false);
        return;
      }

      if (!data?.success || !data?.analysis) {
        toast.error(data?.error || "Failed to analyze food. Please try again.");
        setState("input");
        setIsAnalyzing(false);
        return;
      }

      setAnalysisData(data.analysis);
      setAnalysisReady(true);
    } catch (e) {
      console.error("DESCRIBE_ANALYZE_FAILED", e);
      toast.error("Analysis failed. Please try again.");
      setState("input");
      setIsAnalyzing(false);
    }
  }, [foodName, servingSize]);

  const handleAddToLog = useCallback(async () => {
    if (!analysisData) {
      toast.error("No analysis data to save");
      return;
    }

    try {
      setState("saving");
      setSavingComplete(false);
      
      const { data: { session } } = await supabase.auth.getSession();
      let userId = session?.user?.id;
      
      if (!userId) {
        const { data: { user: fallbackUser } } = await supabase.auth.getUser();
        userId = fallbackUser?.id;
      }
      
      if (!userId) {
        toast.error("Please sign in to save meals");
        setState("results");
        return;
      }

      // Call save-food-log (no image for described food)
      const { data, error } = await supabase.functions.invoke("save-food-log", {
        body: {
          userId,
          analysis: analysisData,
          imageUrl: null, // No image for described food
          source: "describe", // Mark as described food
        },
      });

      if (error) {
        console.error("Failed to save food log:", error);
        toast.error("Failed to save meal. Please try again.");
        setState("results");
        return;
      }

      if (data?.error) {
        console.error("Food log save error:", data.error);
        toast.error(data.error);
        setState("results");
        return;
      }

      console.log('Food log saved successfully:', data);

      // Wait for data to refresh before closing
      if (refreshDataAsync) {
        try {
          console.log('Refreshing data...');
          await refreshDataAsync();
          console.log('Data refreshed successfully');
        } catch (refreshError) {
          console.warn('Data refresh failed, closing anyway:', refreshError);
        }
      }

      // Mark saving as complete to trigger animation finish
      setSavingComplete(true);
    } catch (e) {
      console.error("Error saving food log:", e);
      toast.error("Failed to save meal. Please try again.");
      setState("results");
    }
  }, [analysisData, refreshDataAsync]);

  const handleSavingDone = useCallback(() => {
    toast.success("Meal added to your log!");
    handleClose(true);
  }, [handleClose]);

  // Analyzing state
  if (state === "analyzing") {
    return (
      <AnalyzingScreen
        done={analysisReady}
        onDone={() => {
          if (analysisData) setState("results");
        }}
      />
    );
  }

  // Saving state - show loading while saving and refreshing data
  if (state === "saving") {
    return (
      <SavingScreen
        done={savingComplete}
        onDone={handleSavingDone}
      />
    );
  }

  // Results state
  if (state === "results" && analysisData) {
    return (
      <AnalysisResults
        image={null}
        analysis={analysisData}
        onAddToLog={handleAddToLog}
        onClose={handleClose}
      />
    );
  }

  // Input state - friendly describe food UI
  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <button
          onClick={() => handleClose()}
          className="h-11 w-11 rounded-full bg-card/80 backdrop-blur-md border border-border/50 flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-foreground" />
        </button>
        <h2 className="text-foreground font-semibold text-lg">Describe Food</h2>
        <div className="w-11" />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-6 pt-6 pb-safe overflow-y-auto">
        {/* Friendly intro */}
        <div className="mb-8">
          <h3 className="text-foreground text-2xl font-bold mb-2">What are you eating? 🍽️</h3>
          <p className="text-muted-foreground text-sm">
            Tell us what food you're having and we'll analyze its nutritional value and health impact for you.
          </p>
        </div>

        {/* Food Description Input */}
        <div className="mb-6">
          <label className="text-foreground font-medium text-sm mb-2 block">
            What food is it?
          </label>
          <input
            type="text"
            value={foodName}
            onChange={(e) => setFoodName(e.target.value)}
            placeholder="e.g., Grilled chicken salad with olive oil dressing"
            className="w-full rounded-2xl bg-card border border-border/50 px-4 py-4 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
          />
        </div>

        {/* Serving Size Input */}
        <div className="mb-8">
          <label className="text-foreground font-medium text-sm mb-2 block">
            How much are you eating?
          </label>
          <input
            type="text"
            value={servingSize}
            onChange={(e) => setServingSize(e.target.value)}
            placeholder="e.g., 1 bowl, 2 pieces, 250g"
            className="w-full rounded-2xl bg-card border border-border/50 px-4 py-4 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
          />
          <p className="text-muted-foreground text-xs mt-2">
            Optional - helps us calculate more accurate nutrition info
          </p>
        </div>

        {/* Tips */}
        <div className="rounded-2xl bg-card/60 border border-border/30 p-4 mb-8">
          <p className="text-muted-foreground text-xs leading-relaxed">
            💡 <strong className="text-foreground">Tip:</strong> Be specific about ingredients and preparation method for the most accurate analysis. For example, "grilled salmon with steamed broccoli" instead of just "fish and vegetables".
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />
      </main>

      {/* Bottom CTA */}
      <div 
        className="px-6 pb-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}
      >
        <button
          onClick={handleAnalyze}
          disabled={!foodName.trim() || isAnalyzing}
          className="w-full rounded-2xl bg-foreground py-4 text-base font-semibold text-background active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
