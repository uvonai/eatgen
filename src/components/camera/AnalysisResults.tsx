import { X, Plus, AlertTriangle, Activity, Heart, Sparkles, Skull, Eye, EyeOff, Leaf, ChevronRight, Share2 } from "lucide-react";
import { FoodAnalysis } from "@/hooks/useFoodAnalysis";
import { useShareAnalysis } from "@/hooks/useShareAnalysis";
import { SecureFoodImage } from "@/components/SecureFoodImage";

interface AnalysisResultsProps {
  image: string | null;
  analysis: FoodAnalysis;
  /** For new scans: provide onAddToLog. For logged meals, omit and set mode="logged". */
  onAddToLog?: () => void;
  onClose: () => void;
  mode?: "new" | "logged";
}

// Calculate risk score based on health_impact if not provided
const calculateRiskScore = (analysis: FoodAnalysis): number => {
  if (analysis.risk_score !== undefined) return analysis.risk_score;
  
  // Fallback calculation based on health_impact and nutrients
  let score = 50;
  if (analysis.health_impact === "good") score = 25;
  if (analysis.health_impact === "risky") score = 75;
  
  // Adjust based on sugar and sodium
  if ((analysis.sugar_g || 0) > 30) score += 10;
  if ((analysis.sodium_mg || 0) > 1000) score += 10;
  
  return Math.min(100, Math.max(0, score));
};

// Calculate lifespan impact if not provided (returns days) - deterministic based on nutrients
const calculateLifespanImpact = (analysis: FoodAnalysis): number => {
  if (analysis.lifespan_impact_days !== undefined) return analysis.lifespan_impact_days;
  
  // Deterministic fallback based on nutrients (no randomness)
  if (analysis.health_impact === "good") {
    const fiberBonus = Math.min((analysis.fiber_g || 0) * 0.3, 1.5);
    const proteinBonus = Math.min((analysis.protein_g || 0) * 0.05, 0.5);
    return Math.round((0.5 + fiberBonus + proteinBonus) * 10) / 10; // 0.5 to ~2.5 days
  }
  if (analysis.health_impact === "risky") {
    const sugarPenalty = Math.min((analysis.sugar_g || 0) * 0.05, 1.5);
    const sodiumPenalty = Math.min((analysis.sodium_mg || 0) * 0.001, 1);
    return -Math.round((1 + sugarPenalty + sodiumPenalty) * 10) / 10; // -1 to ~-3.5 days
  }
  return 0;
};

// Format lifespan impact: show hours if < 24 hours (< 1 day), otherwise show days
const formatLifespanImpact = (impactDays: number): { value: string; unit: string } => {
  const absDays = Math.abs(impactDays);
  
  // If less than 1 day, show in hours
  if (absDays < 1) {
    const hours = Math.round(absDays * 24);
    if (hours === 0) {
      return { value: '0', unit: 'hours' };
    }
    return { value: `${impactDays >= 0 ? '+' : '-'}${hours}`, unit: hours === 1 ? 'hour' : 'hours' };
  }
  
  // 1 day or more, show in days
  const roundedDays = Math.round(absDays * 10) / 10; // Round to 1 decimal
  return { 
    value: `${impactDays >= 0 ? '+' : '-'}${roundedDays}`, 
    unit: roundedDays === 1 ? 'day' : 'days' 
  };
};

// Disease risk descriptions mapped to specific conditions
const getDiseaseRiskDetails = (risk: string, analysis: FoodAnalysis): { level: 'low' | 'medium' | 'high'; description: string } => {
  const riskLower = risk.toLowerCase();
  
  // Check for specific disease mentions and return appropriate descriptions
  if (riskLower.includes("diabetes") || riskLower.includes("blood sugar")) {
    const sugarLevel = analysis.sugar_g || 0;
    if (sugarLevel > 30) {
      return { level: 'high', description: "May increase risk of Type 2 Diabetes due to high sugar content" };
    }
    return { level: 'medium', description: "May contribute to insulin resistance over time" };
  }
  
  if (riskLower.includes("hypertension") || riskLower.includes("blood pressure")) {
    const sodiumLevel = analysis.sodium_mg || 0;
    if (sodiumLevel > 1000) {
      return { level: 'high', description: "Linked to high blood pressure and hypertension risk" };
    }
    return { level: 'medium', description: "May elevate blood pressure with regular consumption" };
  }
  
  if (riskLower.includes("heart") || riskLower.includes("cardiovascular") || riskLower.includes("cardiac")) {
    const fatLevel = analysis.fat_g || 0;
    if (fatLevel > 35) {
      return { level: 'high', description: "Linked to cardiovascular disease and arterial plaque buildup" };
    }
    return { level: 'medium', description: "May affect heart health with frequent consumption" };
  }
  
  if (riskLower.includes("obesity") || riskLower.includes("weight")) {
    const calories = analysis.calories || 0;
    if (calories > 500) {
      return { level: 'high', description: "High caloric density may contribute to obesity" };
    }
    return { level: 'medium', description: "May contribute to weight gain over time" };
  }
  
  if (riskLower.includes("inflammation") || riskLower.includes("inflammatory")) {
    return { level: 'medium', description: "May trigger inflammatory responses in the body" };
  }
  
  if (riskLower.includes("cancer")) {
    return { level: 'high', description: "Contains compounds potentially linked to increased cancer risk" };
  }
  
  if (riskLower.includes("cholesterol")) {
    return { level: 'medium', description: "May raise LDL cholesterol levels" };
  }
  
  if (riskLower.includes("liver")) {
    return { level: 'medium', description: "May put strain on liver function" };
  }
  
  if (riskLower.includes("kidney")) {
    return { level: 'medium', description: "May affect kidney health with high sodium content" };
  }
  
  if (riskLower.includes("low")) {
    return { level: 'low', description: "Minimal concern for chronic health conditions" };
  }
  
  if (riskLower.includes("medium") || riskLower.includes("moderate")) {
    return { level: 'medium', description: "May contribute to metabolic stress with regular intake" };
  }
  
  // Default high risk description
  return { level: 'high', description: "Linked to increased risk of chronic health conditions" };
};

// Generate disease risks if not provided
const getDefaultDiseaseRisks = (analysis: FoodAnalysis): string[] => {
  if (analysis.disease_risks && analysis.disease_risks.length > 0) return analysis.disease_risks;
  
  const risks: string[] = [];
  if ((analysis.sugar_g || 0) > 25) risks.push("Diabetes Risk");
  if ((analysis.sodium_mg || 0) > 800) risks.push("Hypertension");
  if ((analysis.fat_g || 0) > 30) risks.push("Heart Disease");
  if (analysis.health_impact === "risky") risks.push("Inflammation");
  
  return risks.length > 0 ? risks : ["Low Risk"];
};

// Only use AI-returned hidden ingredients — never fabricate from macros
const getDefaultHiddenIngredients = (analysis: FoodAnalysis): string[] => {
  if (analysis.hidden_ingredients && analysis.hidden_ingredients.length > 0) return analysis.hidden_ingredients;
  return [];
};

// Only use AI-returned alternatives — return empty for healthy foods
const getDefaultAlternatives = (analysis: FoodAnalysis): string[] => {
  if (analysis.safer_alternatives && analysis.safer_alternatives.length > 0) return analysis.safer_alternatives;
  return [];
};

export const AnalysisResults = ({ image, analysis, onAddToLog, onClose, mode = "new" }: AnalysisResultsProps) => {
  const { share, isSharing } = useShareAnalysis();
  const riskScore = calculateRiskScore(analysis);
  const lifespanImpact = calculateLifespanImpact(analysis);
  const formattedImpact = formatLifespanImpact(lifespanImpact);
  const diseaseRisks = getDefaultDiseaseRisks(analysis);
  const hiddenIngredients = getDefaultHiddenIngredients(analysis);
  const whatTheyDontTellYou = analysis.what_they_dont_tell_you && analysis.what_they_dont_tell_you.length > 0 ? analysis.what_they_dont_tell_you : [];
  const saferAlternatives = getDefaultAlternatives(analysis);

  const isLogged = mode === "logged";

  const handleShare = () => {
    share({ image, analysis });
  };

  // Determine risk color
  const getRiskColor = () => {
    if (riskScore <= 33) return { bg: "bg-emerald-500", text: "text-emerald-400", label: "Low Risk", bgLight: "bg-emerald-500/15", border: "border-emerald-500/30" };
    if (riskScore <= 66) return { bg: "bg-amber-500", text: "text-amber-400", label: "Medium Risk", bgLight: "bg-amber-500/15", border: "border-amber-500/30" };
    return { bg: "bg-rose-500", text: "text-rose-400", label: "High Risk", bgLight: "bg-rose-500/15", border: "border-rose-500/30" };
  };

  const riskStyle = getRiskColor();

  return (
    <div className="fixed inset-0 z-[200] bg-background overflow-y-auto">
      {/* Header */}
      <header 
        className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl px-5 py-3 flex items-center justify-between border-b border-border/40"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-muted/30 flex items-center justify-center"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
        
        <h2 className="text-foreground font-semibold text-base">Food Analysis</h2>
        
        <button
          onClick={handleShare}
          disabled={isSharing}
          className="w-9 h-9 rounded-full bg-muted/30 flex items-center justify-center disabled:opacity-50"
        >
          <Share2 className="w-4 h-4 text-foreground" />
        </button>
      </header>
      
      {/* Content - less bottom padding for logged view since no action buttons */}
      <div className={`px-5 ${mode === "logged" ? "pb-12" : "pb-36"}`}>
        {/* Food Header with Image */}
        <div className="py-4">
          <div className="flex gap-4 items-start">
            {image && (
              <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                {mode === "logged" ? (
                  <SecureFoodImage src={image} alt="Food" className="w-full h-full object-cover" />
                ) : (
                  <img src={image} alt="Food" className="w-full h-full object-cover" />
                )}
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground text-xl font-bold leading-tight">{analysis.food_name}</h3>
              {analysis.cuisine && analysis.portion && (
                <p className="text-muted-foreground text-sm mt-0.5">
                  {analysis.cuisine} • {analysis.portion}
                </p>
              )}
              {analysis.confidence && (
                <p className="text-muted-foreground text-xs mt-1">
                  {analysis.confidence}% confidence
                </p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 1: Food Risk Score - Apple Style */}
        <div className="rounded-2xl p-5 bg-card border border-border/40 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-muted/30 flex items-center justify-center">
                <Activity className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide">Food Risk Score</p>
                <p className="text-foreground text-xl font-semibold">{riskStyle.label}</p>
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-full ${riskStyle.bg}`}>
              <span className="text-white text-xs font-semibold">{riskScore}%</span>
            </div>
          </div>
          
          {/* Risk meter */}
          <div className="relative h-2 rounded-full bg-muted/30 overflow-hidden">
            <div 
              className={`absolute top-0 bottom-0 left-0 ${riskStyle.bg} transition-all duration-500 rounded-full`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground font-medium">
            <span>Safe</span>
            <span>Moderate</span>
            <span>Risky</span>
          </div>
        </div>

        {/* SECTION 2: Nutrition Details */}
        <div className="rounded-2xl p-4 bg-muted/20 border border-border/40 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h4 className="text-foreground text-sm font-semibold">Nutrition Breakdown</h4>
          </div>
          
          {/* Calories - Featured */}
          <div className="bg-gradient-to-r from-orange-500/20 to-orange-500/5 rounded-xl p-4 mb-3 border border-orange-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-400/70 text-xs font-medium">Calories</p>
                <p className="text-foreground text-3xl font-bold">{analysis.calories}</p>
              </div>
              <span className="text-3xl">🔥</span>
            </div>
          </div>
          
          {/* Macros Grid */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <NutrientCard label="Protein" value={analysis.protein_g} unit="g" color="pink" />
            <NutrientCard label="Carbs" value={analysis.carbs_g} unit="g" color="yellow" />
            <NutrientCard label="Fat" value={analysis.fat_g} unit="g" color="blue" />
            <NutrientCard label="Fiber" value={analysis.fiber_g} unit="g" color="green" />
          </div>
          
          {/* Sugar & Sodium */}
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-xl p-3 ${(analysis.sugar_g || 0) > 25 ? 'bg-rose-500/15 border border-rose-500/25' : 'bg-muted/20 border border-border/40'}`}>
              <p className="text-muted-foreground text-[10px] font-medium uppercase">Sugar</p>
              <p className="text-foreground text-lg font-bold">{analysis.sugar_g || 0}g</p>
            </div>
            <div className={`rounded-xl p-3 ${(analysis.sodium_mg || 0) > 800 ? 'bg-rose-500/15 border border-rose-500/25' : 'bg-muted/20 border border-border/40'}`}>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-[10px] font-medium uppercase">Sodium</p>
                {(analysis.sodium_mg || 0) > 800 && <AlertTriangle className="w-3 h-3 text-rose-400" />}
              </div>
              <p className="text-foreground text-lg font-bold">{analysis.sodium_mg || 0}mg</p>
            </div>
          </div>
        </div>

{/* SECTION 3: Additives — only show if AI returned actual additives */}
        {hiddenIngredients.length > 0 ? (
          <div className="rounded-2xl p-4 bg-muted/20 border border-border/40 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h4 className="text-foreground text-sm font-semibold">Additives</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {hiddenIngredients.map((item, idx) => (
                <span key={idx} className="px-3 py-1.5 rounded-full text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-4 bg-muted/20 border border-border/40 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-emerald-400" />
              <h4 className="text-foreground text-sm font-semibold">Additives</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                No Harmful Additives
              </span>
            </div>
          </div>
        )}

        {/* SECTION 4: Disease Risk Flags */}
        <div className="rounded-2xl p-4 bg-muted/20 border border-border/40 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Skull className="w-4 h-4 text-rose-400" />
            <h4 className="text-foreground text-sm font-semibold">Disease Risk Flags</h4>
          </div>
          <div className="space-y-3">
            {diseaseRisks.map((risk, idx) => {
              const riskDetails = getDiseaseRiskDetails(risk, analysis);
              
              return (
                <div key={idx} className="flex flex-col gap-1">
                  <span 
                    className={`px-3 py-1.5 rounded-full text-xs font-medium w-fit ${
                      riskDetails.level === 'low'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : riskDetails.level === 'medium'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {risk}
                  </span>
                  <p className="text-muted-foreground text-xs pl-1">{riskDetails.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 5: Lifespan Impact */}
        <div className={`rounded-2xl p-4 ${lifespanImpact >= 0 ? 'bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-transparent border-emerald-500/25' : 'bg-gradient-to-br from-rose-500/20 via-orange-500/10 to-transparent border-rose-500/25'} border mb-4`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${lifespanImpact >= 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'} flex items-center justify-center`}>
              <Heart className={`w-6 h-6 ${lifespanImpact >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
            <div className="flex-1">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Healthy Lifespan Impact</p>
              <p className={`text-2xl font-bold ${lifespanImpact >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formattedImpact.value} {formattedImpact.unit}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-3">
            {lifespanImpact >= 0 
              ? "This food supports your longevity goals! Keep it up."
              : "Regular consumption may reduce healthy lifespan. Consider alternatives."}
          </p>
        </div>

        {/* SECTION 5.5: What They Don't Tell You — legally hidden / undisclosed ingredients */}
        {whatTheyDontTellYou.length > 0 && (
          <div className="rounded-2xl p-4 bg-gradient-to-br from-fuchsia-500/15 via-pink-500/10 to-transparent border border-fuchsia-500/25 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <EyeOff className="w-4 h-4 text-fuchsia-400" />
              <h4 className="text-fuchsia-400 text-sm font-semibold">What They Don't Tell You</h4>
            </div>
            <div className="space-y-2.5">
              {whatTheyDontTellYou.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-fuchsia-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-fuchsia-400 text-[10px] font-bold">!</span>
                  </span>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 6: Safer Alternatives — hide entirely when none needed */}
        {saferAlternatives.length > 0 && (
          <div className="rounded-2xl p-4 bg-gradient-to-br from-violet-500/15 via-purple-500/10 to-transparent border border-violet-500/25 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="w-4 h-4 text-violet-400" />
              <h4 className="text-violet-400 text-sm font-semibold">Safer Alternatives</h4>
            </div>
            <div className="space-y-2">
              {saferAlternatives.map((alt, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-violet-400/60 mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground text-sm">{alt}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Summary - Clean Apple Style */}
        <div className="rounded-2xl bg-card border border-border/40 overflow-hidden mb-4">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <h4 className="text-foreground text-sm font-semibold">AI Summary</h4>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Brief Overview */}
            {analysis.summary && (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {analysis.summary}
              </p>
            )}
            
            {/* Benefits Section - Only show if healthy food has benefits */}
            {analysis.daily_benefits && analysis.daily_benefits.length > 0 && analysis.health_impact !== 'risky' && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                <p className="text-emerald-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">✓</span>
                  Benefits if Eaten Regularly
                </p>
                <div className="space-y-1.5">
                  {analysis.daily_benefits.slice(0, 3).map((benefit: string, idx: number) => (
                    <p key={idx} className="text-muted-foreground text-xs flex items-start gap-2">
                      <span className="text-emerald-400/50 mt-0.5">•</span>
                      {benefit}
                    </p>
                  ))}
                </div>
              </div>
            )}
            
            {/* Risks Section - Only show if risky food has risks */}
            {analysis.daily_risks && analysis.daily_risks.length > 0 && analysis.health_impact !== 'good' && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
                <p className="text-rose-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-rose-500/20 flex items-center justify-center text-[10px]">!</span>
                  Risks if Consumed Frequently
                </p>
                <div className="space-y-1.5">
                  {analysis.daily_risks.slice(0, 3).map((risk: string, idx: number) => (
                    <p key={idx} className="text-muted-foreground text-xs flex items-start gap-2">
                      <span className="text-rose-400/50 mt-0.5">•</span>
                      {risk}
                    </p>
                  ))}
                </div>
              </div>
            )}
            
            {/* No significant issues for healthy foods */}
            {analysis.health_impact === 'good' && (!analysis.daily_risks || analysis.daily_risks.length === 0) && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs">✓</span>
                <p className="text-emerald-400/80 text-xs">No significant health risks detected</p>
              </div>
            )}
            
            {/* Final Verdict - Apple Style Card */}
            <div className={`rounded-xl p-3 ${
              riskScore <= 33 
                ? 'bg-emerald-500/10 border border-emerald-500/20' 
                : riskScore <= 60 
                  ? 'bg-amber-500/10 border border-amber-500/20'
                  : 'bg-rose-500/10 border border-rose-500/20'
            }`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                riskScore <= 33 ? 'text-emerald-400' : riskScore <= 60 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                Verdict
              </p>
              <p className="text-foreground text-sm font-medium">
                {analysis.final_verdict || (
                  riskScore <= 33 
                    ? "This is a healthy choice for your diet." 
                    : riskScore <= 60 
                      ? "Okay in moderation, but don't overdo it."
                      : "Limit or avoid this food for better health."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Actions - Only show for new scans, not when viewing logged meals */}
      {mode !== "logged" && (
        <div 
          className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-gradient-to-t from-background via-background to-transparent"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        >
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <X className="w-4 h-4 text-background" />
              <span className="text-background font-semibold text-sm">Skip It</span>
            </button>
            <button
              onClick={onAddToLog}
              className="flex-1 py-4 rounded-2xl bg-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Plus className="w-4 h-4 text-background" />
              <span className="text-background font-semibold text-sm">Add to Log</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Logged meals view uses header X button only - no duplicate bottom button */}
    </div>
  );
};

interface NutrientCardProps {
  label: string;
  value: number;
  unit: string;
  color: 'pink' | 'yellow' | 'blue' | 'green';
}

const colorStyles = {
  pink: 'from-pink-500/20 to-pink-500/5 border-pink-500/20',
  yellow: 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/20',
  blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20',
  green: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
};

const NutrientCard = ({ label, value, unit, color }: NutrientCardProps) => {
  return (
    <div className={`p-2.5 rounded-xl bg-gradient-to-b ${colorStyles[color]} border`}>
      <p className="text-foreground text-base font-bold">
        {value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>
      </p>
      <p className="text-muted-foreground text-[9px]">{label}</p>
    </div>
  );
};
