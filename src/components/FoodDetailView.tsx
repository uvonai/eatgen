import { AnalysisResults } from "@/components/camera/AnalysisResults";
import type { FoodAnalysis } from "@/hooks/useFoodAnalysis";

interface FoodDetailViewProps {
  meal: {
    id: string;
    food_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    health_impact: string;
    scanned_at: string;
    image_url?: string | null;
    ai_analysis?: any;
  };
  onClose: () => void;
}

/**
 * Logged-meal detail view.
 * Reuses the exact same UI as the first-time analysis screen,
 * so Sugar/Sodium + all sections always show.
 */
export function FoodDetailView({ meal, onClose }: FoodDetailViewProps) {
  const analysis: FoodAnalysis = {
    ...(meal.ai_analysis || {}),
    food_name: meal.food_name,
    calories: meal.calories,
    protein_g: meal.protein_g,
    carbs_g: meal.carbs_g,
    fat_g: meal.fat_g,
    fiber_g: meal.fiber_g,
    health_impact: (meal.health_impact as FoodAnalysis["health_impact"]) || "neutral",
  };

  return (
    <AnalysisResults
      image={meal.image_url ?? null}
      analysis={analysis}
      mode="logged"
      onClose={onClose}
    />
  );
}
