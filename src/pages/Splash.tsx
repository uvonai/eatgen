import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";

const SPLASH_SHOWN_KEY = "eatgen_splash_shown";

const Splash = () => {
  const navigate = useNavigate();
  const { isAuthenticated, hasOnboarding, loading } = useAuthContext();
  const [isVisible, setIsVisible] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    // Prevent double navigation
    if (navigatedRef.current) return;

    const splashShown = sessionStorage.getItem(SPLASH_SHOWN_KEY);

    const goNext = () => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      try {
        if (isAuthenticated && hasOnboarding) {
          navigate("/home", { replace: true });
        } else if (isAuthenticated && !hasOnboarding) {
          navigate("/questionnaire", { replace: true });
        } else {
          navigate("/auth", { replace: true });
        }
      } catch (e) {
        console.warn("Navigation failed:", e);
        navigate("/auth", { replace: true });
      }
    };

    // Wait for auth to finish loading
    if (loading) {
      setIsVisible(true);
      return;
    }

    if (splashShown) {
      goNext();
      return;
    }

    sessionStorage.setItem(SPLASH_SHOWN_KEY, "true");

    const showTimer = window.setTimeout(() => setIsVisible(true), 100);
    const splashDuration = isAuthenticated ? 1200 : 2500;
    const navTimer = window.setTimeout(goNext, splashDuration);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(navTimer);
    };
  }, [navigate, isAuthenticated, hasOnboarding, loading]);

  // Safety: if stuck on splash for too long, force navigate
  useEffect(() => {
    const safetyTimer = window.setTimeout(() => {
      if (!navigatedRef.current) {
        console.warn("Splash: Safety timeout - forcing navigation");
        navigatedRef.current = true;
        navigate("/auth", { replace: true });
      }
    }, 10000);
    return () => window.clearTimeout(safetyTimer);
  }, [navigate]);

  return (
    <div 
      className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-hidden bg-black"
      style={{ 
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      <div className="flex flex-1 items-center justify-center">
        <h1 
          className={`text-white text-[42px] md:text-[56px] font-bold tracking-tight transition-all duration-1000 ease-out ${
            isVisible 
              ? 'opacity-100 scale-100 translate-y-0' 
              : 'opacity-0 scale-95 translate-y-4'
          }`}
        >
          Eatgen AI
        </h1>
      </div>
      
      <p 
        className={`pb-20 text-[13px] font-light tracking-[0.15em] text-white/50 transition-all duration-1000 ease-out delay-500 ${
          isVisible 
            ? 'opacity-100 translate-y-0' 
            : 'opacity-0 translate-y-4'
        }`}
      >
        What's really inside your food?
      </p>
    </div>
  );
};

export default Splash;