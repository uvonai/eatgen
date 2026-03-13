import { useCallback, useState } from "react";
import type { FoodAnalysis } from "@/hooks/useFoodAnalysis";
import { createShareAnalysisImageBlob } from "@/lib/share-analysis/createShareImage";

interface ShareOptions {
  image: string | null;
  analysis: FoodAnalysis;
}

const toSafeFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);

export function useShareAnalysis() {
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(async ({ image, analysis }: ShareOptions) => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      const blob = await createShareAnalysisImageBlob(image, analysis);
      const base = toSafeFileName(analysis.food_name || "eatgen-analysis");
      const file = new File([blob], `${base || "eatgen-analysis"}.png`, { type: "image/png" });

      // Prefer sharing the image file first (some platforms don’t implement canShare correctly).
      if (navigator.share) {
        try {
          await navigator.share({
            files: [file],
            title: `${analysis.food_name || "Food"} - Eatgen AI Analysis`,
            text: `Eatgen AI food analysis`,
          });
          return;
        } catch (e) {
          // User cancel / platform rejection → fall through to other options.
          console.log("Share cancelled or file-share not supported:", e);
        }
      }

      // Fallback: download image
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base || "eatgen-analysis"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.log("Share cancelled or failed:", error);
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  return { share, isSharing };
}
