import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

/**
 * Hook to handle hardware back button on native platforms.
 * Navigates to previous page instead of closing the app.
 */
export function useHardwareBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only run on native platforms
    if (!Capacitor.isNativePlatform()) return;

    let backButtonListener: any = null;

    const setupBackButton = async () => {
      try {
        const { App } = await import("@capacitor/app");
        
        backButtonListener = await App.addListener("backButton", ({ canGoBack }) => {
          // Define pages where back should exit app
          const exitPages = ["/", "/home", "/splash"];
          const currentPath = location.pathname;
          
          if (exitPages.includes(currentPath)) {
            // On main pages, exit the app
            App.exitApp();
          } else if (canGoBack) {
            // Navigate back in browser history
            navigate(-1);
          } else {
            // Fallback to home if no history
            navigate("/home", { replace: true });
          }
        });
      } catch (e) {
        console.warn("Could not setup back button listener:", e);
      }
    };

    setupBackButton();

    return () => {
      if (backButtonListener) {
        backButtonListener.remove();
      }
    };
  }, [navigate, location.pathname]);
}
