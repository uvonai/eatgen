import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { FoodAnalysis } from "@/hooks/useFoodAnalysis";

interface PendingMeal {
  id: string;
  analysis: FoodAnalysis;
  imagePreviewUrl: string | null;
  addedAt: Date;
}

interface OptimisticMealContextType {
  pendingMeal: PendingMeal | null;
  addPendingMeal: (analysis: FoodAnalysis, imagePreviewUrl: string | null) => string;
  removePendingMeal: (id: string) => void;
  clearPendingMeal: () => void;
}

const OptimisticMealContext = createContext<OptimisticMealContextType | null>(null);

export function OptimisticMealProvider({ children }: { children: ReactNode }) {
  const [pendingMeal, setPendingMeal] = useState<PendingMeal | null>(null);

  const addPendingMeal = useCallback((analysis: FoodAnalysis, imagePreviewUrl: string | null) => {
    const id = `pending-${Date.now()}`;
    setPendingMeal({
      id,
      analysis,
      imagePreviewUrl,
      addedAt: new Date(),
    });
    return id;
  }, []);

  const removePendingMeal = useCallback((id: string) => {
    setPendingMeal((current) => (current?.id === id ? null : current));
  }, []);

  const clearPendingMeal = useCallback(() => {
    setPendingMeal(null);
  }, []);

  return (
    <OptimisticMealContext.Provider value={{ pendingMeal, addPendingMeal, removePendingMeal, clearPendingMeal }}>
      {children}
    </OptimisticMealContext.Provider>
  );
}

export function useOptimisticMeal() {
  const context = useContext(OptimisticMealContext);
  if (!context) {
    throw new Error("useOptimisticMeal must be used within OptimisticMealProvider");
  }
  return context;
}
