import { useNavigate } from "react-router-dom";
import { ChevronLeft, AlertTriangle, TrendingDown, TrendingUp, Shield, Heart, Droplets, Flame, Activity, Info, CheckCircle } from "lucide-react";
import { useDailySummary } from "@/hooks/useDailySummary";

const RiskSignals = () => {
  const navigate = useNavigate();
  const { meals, loading, refetch } = useDailySummary();

  // Show loading screen
  if (loading) {
    return (
      <div className="h-[100dvh] h-screen bg-background flex flex-col items-center justify-center">
        <div className="h-12 w-12 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin mb-4" />
        <p className="text-muted-foreground text-sm">Analyzing risk signals...</p>
      </div>
    );
  }

  // Analyze risk signals from logged foods
  const riskAnalysis = meals.reduce(
    (acc, meal) => {
      const analysis = meal.ai_analysis as any;
      
      // Count risky meals
      if (meal.health_impact === "risky") {
        acc.riskyMeals++;
        // Collect risky food names
        if (meal.food_name) {
          acc.riskyFoods.push(meal.food_name);
        }
      }

      // Aggregate disease risks from AI analysis
      if (analysis?.disease_risks) {
        analysis.disease_risks.forEach((risk: any) => {
          const condition = typeof risk === 'string' ? risk : risk.condition;
          const riskLevel = typeof risk === 'object' ? risk.risk_level : 'Medium';
          
          const existing = acc.diseaseRisks.find((r) => r.name === condition);
          if (existing) {
            existing.count++;
            if (riskLevel === "High") existing.highCount++;
          } else {
            acc.diseaseRisks.push({
              name: condition,
              count: 1,
              highCount: riskLevel === "High" ? 1 : 0,
              advice: getDiseaseAdvice(condition),
            });
          }
        });
      }

      // Aggregate harmful additives
      if (analysis?.additives) {
        analysis.additives.forEach((additive: any) => {
          if (additive.harmful) {
            const existing = acc.harmfulAdditives.find((a) => a.name === additive.name);
            if (existing) {
              existing.count++;
            } else {
              acc.harmfulAdditives.push({ 
                name: additive.name, 
                count: 1,
                effect: additive.effect || "May have negative health effects"
              });
            }
          }
        });
      }

      // Track lifespan impact
      if (analysis?.lifespan_impact_days) {
        acc.lifespanImpact += analysis.lifespan_impact_days;
      } else if (analysis?.lifespan_impact?.days) {
        acc.lifespanImpact += analysis.lifespan_impact.days;
      }

      // Collect recommendations
      if (analysis?.safer_alternatives && Array.isArray(analysis.safer_alternatives)) {
        acc.saferAlternatives.push(...analysis.safer_alternatives);
      }

      return acc;
    },
    {
      riskyMeals: 0,
      riskyFoods: [] as string[],
      diseaseRisks: [] as { name: string; count: number; highCount: number; advice: string }[],
      harmfulAdditives: [] as { name: string; count: number; effect: string }[],
      lifespanImpact: 0,
      saferAlternatives: [] as string[],
    }
  );

  const totalMeals = meals.length;
  const riskPercentage = totalMeals > 0 ? Math.round((riskAnalysis.riskyMeals / totalMeals) * 100) : 0;

  // Deduplicate safer alternatives
  const uniqueAlternatives = [...new Set(riskAnalysis.saferAlternatives)].slice(0, 5);

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Header */}
      <header
        className="relative z-10 px-4 py-3 border-b border-border/40 flex-shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 12px) + 12px)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="h-10 w-10 rounded-full bg-card/80 border border-border/50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-foreground text-lg font-semibold">Risk Analysis</h1>
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide will-change-scroll px-5 py-6 space-y-4 pb-24" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {/* Summary Card */}
        <section className="rounded-2xl bg-card border border-border/40 p-5">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              riskAnalysis.riskyMeals > 0 ? "bg-rose-500/20" : "bg-emerald-500/20"
            }`}>
              {riskAnalysis.riskyMeals > 0 ? (
                <AlertTriangle className="w-7 h-7 text-rose-400" />
              ) : (
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-foreground text-xl font-bold">
                {riskAnalysis.riskyMeals > 0 ? `${riskAnalysis.riskyMeals} Risky Meal${riskAnalysis.riskyMeals > 1 ? 's' : ''}` : "All Clear!"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {totalMeals > 0 
                  ? `Out of ${totalMeals} meal${totalMeals > 1 ? 's' : ''} logged today` 
                  : "No meals logged yet today"}
              </p>
            </div>
            {totalMeals > 0 && (
              <div className="text-right">
                <span className={`text-2xl font-bold ${riskPercentage > 30 ? "text-rose-400" : riskPercentage > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {riskPercentage}%
                </span>
                <p className="text-muted-foreground text-xs">Risk rate</p>
              </div>
            )}
          </div>
        </section>

        {/* Risky Foods You Ate */}
        {riskAnalysis.riskyFoods.length > 0 && (
          <section className="rounded-2xl bg-card border border-border/40 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Flame className="w-5 h-5 text-rose-400" />
              <h3 className="text-foreground font-semibold">Foods With Risk</h3>
            </div>
            <div className="space-y-2">
              {riskAnalysis.riskyFoods.map((food, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="w-2 h-2 rounded-full bg-rose-400" />
                  <span className="text-foreground text-sm font-medium">{food}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lifespan Impact */}
        {totalMeals > 0 && (
          <section className="rounded-2xl bg-card border border-border/40 p-5">
            <div className="flex items-center gap-3 mb-4">
              {riskAnalysis.lifespanImpact >= 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-rose-400" />
              )}
              <h3 className="text-foreground font-semibold">Lifespan Impact Today</h3>
            </div>
            <div className={`text-3xl font-bold ${
              riskAnalysis.lifespanImpact >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}>
              {riskAnalysis.lifespanImpact >= 0 ? "+" : ""}{riskAnalysis.lifespanImpact.toFixed(1)} days
            </div>
            <p className="text-muted-foreground text-sm mt-2">
              {riskAnalysis.lifespanImpact >= 0 
                ? "Great choices! Your meals today are supporting longevity." 
                : "Consider healthier alternatives to improve this score."}
            </p>
          </section>
        )}

        {/* Disease Risk Flags with Advice */}
        {riskAnalysis.diseaseRisks.length > 0 && (
          <section className="rounded-2xl bg-card border border-border/40 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-5 h-5 text-amber-400" />
              <h3 className="text-foreground font-semibold">Health Concerns Detected</h3>
            </div>
            <div className="space-y-4">
              {riskAnalysis.diseaseRisks.map((risk, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-foreground font-medium">{risk.name}</span>
                    {risk.highCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-medium">
                        High Risk
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">{risk.advice}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How to Reduce Risk */}
        {(riskAnalysis.riskyMeals > 0 || uniqueAlternatives.length > 0) && (
          <section className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-emerald-400" />
              <h3 className="text-foreground font-semibold">How to Reduce Your Risk</h3>
            </div>
            <div className="space-y-3">
              {uniqueAlternatives.length > 0 ? (
                uniqueAlternatives.map((alt, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground text-sm">{alt}</span>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground text-sm">Choose whole, unprocessed foods when possible</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground text-sm">Balance meals with vegetables and lean proteins</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground text-sm">Limit added sugars and sodium intake</span>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* Harmful Additives */}
        {riskAnalysis.harmfulAdditives.length > 0 && (
          <section className="rounded-2xl bg-card border border-border/40 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Info className="w-5 h-5 text-rose-400" />
              <h3 className="text-foreground font-semibold">Harmful Additives Found</h3>
            </div>
            <div className="space-y-3">
              {riskAnalysis.harmfulAdditives.map((additive, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-foreground font-medium text-sm">{additive.name}</span>
                    <span className="text-muted-foreground text-xs">{additive.count}x consumed</span>
                  </div>
                  <p className="text-muted-foreground text-xs">{additive.effect}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {totalMeals === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-foreground font-semibold text-lg mb-2">No Data Yet</h3>
            <p className="text-muted-foreground text-sm">Log some meals to see your personalized risk analysis</p>
          </div>
        )}

        {/* All Clear State */}
        {totalMeals > 0 && riskAnalysis.riskyMeals === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-emerald-400 font-semibold text-lg">Excellent Choices!</h3>
            <p className="text-muted-foreground text-sm mt-1">All your meals today are healthy</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to get advice for disease risks
function getDiseaseAdvice(condition: string): string {
  const adviceMap: Record<string, string> = {
    "Type 2 Diabetes": "Reduce sugar intake and choose complex carbs over simple sugars.",
    "Heart Disease": "Limit saturated fats and sodium. Choose heart-healthy fats from fish and nuts.",
    "Hypertension": "Watch sodium intake. Aim for less than 2300mg per day.",
    "Obesity": "Balance calorie intake with physical activity. Focus on portion control.",
    "High Cholesterol": "Choose lean proteins and increase fiber-rich foods.",
    "Cardiovascular Disease": "Reduce processed foods and increase omega-3 fatty acids.",
    "Stroke": "Maintain healthy blood pressure through diet and exercise.",
    "Cancer": "Limit processed meats and increase antioxidant-rich vegetables.",
  };
  
  return adviceMap[condition] || "Monitor your intake and consult a healthcare provider for personalized advice.";
}

export default RiskSignals;