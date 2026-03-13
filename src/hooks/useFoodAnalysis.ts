import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * PRODUCTION-READY FOOD ANALYSIS HOOK
 * - Never crashes even if backend fails
 * - Proper error handling and user-friendly messages
 * - Frontend only sends image and displays results
 * - All analysis done on backend
 */

export interface FoodAnalysis {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  health_impact: "good" | "neutral" | "risky";
  summary?: string;
  recommendations?: string[];
  sugar_g?: number;
  sodium_mg?: number;
  cuisine?: string;
  portion?: string;
  confidence?: number;
  risk_score?: number;
  lifespan_impact_days?: number;
  disease_risks?: string[];
  hidden_ingredients?: string[];
  what_they_dont_tell_you?: string[];
  safer_alternatives?: string[];
  daily_benefits?: string[];
  daily_risks?: string[];
  final_verdict?: string;
}

export interface AnalysisState {
  loading: boolean;
  error: string | null;
  analysis: FoodAnalysis | null;
}

export function useFoodAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    loading: false,
    error: null,
    analysis: null,
  });

  const analyzeFood = useCallback(async (imageFile: File): Promise<FoodAnalysis | null> => {
    setState({ loading: true, error: null, analysis: null });

    try {
      // Validate image file
      if (!imageFile || imageFile.size <= 0) {
        setState({ loading: false, error: "Image not captured. Please try again.", analysis: null });
        return null;
      }

      // Check file size (max 5MB for practical limits)
      if (imageFile.size > 5 * 1024 * 1024) {
        setState({ loading: false, error: "Image too large. Please use a smaller image.", analysis: null });
        return null;
      }

      // Get current user (optional - analysis works for guests too)
      let userId: string | undefined;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      } catch (authError) {
        console.warn('Failed to get user for analysis:', authError);
        // Continue without user ID - analysis still works
      }

      // Convert file to base64
      let base64: string;
      try {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(imageFile);
        });
      } catch (readError) {
        console.error('Failed to read image file:', readError);
        setState({ loading: false, error: "Failed to process image. Please try again.", analysis: null });
        return null;
      }

      // Call edge function (ALL analysis on backend)
      const { data, error } = await supabase.functions.invoke("analyze-food", {
        body: {
          imageBase64: base64,
          userId,
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        setState({ loading: false, error: "Analysis failed. Please try again.", analysis: null });
        return null;
      }

      if (data?.error) {
        console.error("Analysis error:", data.error);
        setState({ loading: false, error: data.error, analysis: null });
        return null;
      }

      // Validate analysis response
      const analysis = data?.analysis as FoodAnalysis;
      if (!analysis || typeof analysis !== 'object') {
        setState({ loading: false, error: "Invalid analysis response. Please try again.", analysis: null });
        return null;
      }

      setState({ loading: false, error: null, analysis });
      return analysis;
    } catch (e: unknown) {
      console.error("useFoodAnalysis error:", e);
      const errorMessage = e instanceof Error ? e.message : "Analysis failed";
      setState({ loading: false, error: errorMessage, analysis: null });
      return null;
    }
  }, []);

  const analyzeBarcodeProduct = useCallback(async (barcode: string): Promise<FoodAnalysis | null> => {
    setState({ loading: true, error: null, analysis: null });

    try {
      if (!barcode || barcode.trim() === '') {
        setState({ loading: false, error: "Invalid barcode. Please try again.", analysis: null });
        return null;
      }

      // Call edge function for barcode analysis
      const { data, error } = await supabase.functions.invoke("analyze-barcode", {
        body: { barcode },
      });

      if (error) {
        console.error("Barcode analysis error:", error);
        setState({ loading: false, error: "Couldn't analyze barcode. Please try again.", analysis: null });
        return null;
      }

      if (data?.error) {
        console.error("Barcode lookup error:", data.error);
        setState({ loading: false, error: data.error, analysis: null });
        return null;
      }

      const analysis = data?.analysis as FoodAnalysis;
      if (!analysis || typeof analysis !== 'object') {
        setState({ loading: false, error: "Product not found. Try scanning another barcode.", analysis: null });
        return null;
      }

      setState({ loading: false, error: null, analysis });
      return analysis;
    } catch (e: unknown) {
      console.error("analyzeBarcodeProduct error:", e);
      const errorMessage = e instanceof Error ? e.message : "Barcode analysis failed";
      setState({ loading: false, error: errorMessage, analysis: null });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, error: null, analysis: null });
  }, []);

  return {
    ...state,
    analyzeFood,
    analyzeBarcodeProduct,
    reset,
  };
}
