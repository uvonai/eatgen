import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthRoute } from "@/components/AuthRoute";
import { PageTransition, SlideTransition } from "@/components/PageTransition";
import Splash from "@/pages/Splash";
import Auth from "@/pages/Auth";
import Questionnaire from "@/pages/Questionnaire";
import NotFound from "@/pages/NotFound";

// Lazy load pages
const Home = lazy(() => import("@/pages/Home"));
const Settings = lazy(() => import("@/pages/Settings"));
const Progress = lazy(() => import("@/pages/Progress"));
const Vera = lazy(() => import("@/pages/Vera"));
const RiskSignals = lazy(() => import("@/pages/RiskSignals"));
const PersonalDetails = lazy(() => import("@/pages/PersonalDetails"));
const EnterName = lazy(() => import("@/pages/EnterName"));
const DailyInsights = lazy(() => import("@/pages/DailyInsights"));
const Hydration = lazy(() => import("@/pages/Hydration"));
const ManageSubscription = lazy(() => import("@/pages/ManageSubscription"));

// Loading fallback
const LoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
  </div>
);

export const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Suspense fallback={<LoadingFallback />}>
        <Routes location={location} key={location.pathname}>
          {/* Splash screen */}
          <Route path="/" element={
            <PageTransition>
              <Splash />
            </PageTransition>
          } />
          
          {/* Auth page */}
          <Route path="/auth" element={
            <AuthRoute>
              <PageTransition>
                <Auth />
              </PageTransition>
            </AuthRoute>
          } />
          
          {/* Questionnaire */}
          <Route path="/questionnaire" element={
            <PageTransition>
              <Questionnaire />
            </PageTransition>
          } />
          
          {/* Main tabs - use fade for tab switching feel */}
          <Route path="/home" element={
            <ProtectedRoute>
              <PageTransition>
                <Home />
              </PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/progress" element={
            <ProtectedRoute>
              <PageTransition>
                <Progress />
              </PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/vera" element={
            <ProtectedRoute>
              <PageTransition>
                <Vera />
              </PageTransition>
            </ProtectedRoute>
          } />
          
          {/* Drill-down pages - use slide for depth */}
          <Route path="/settings" element={
            <ProtectedRoute>
              <SlideTransition>
                <Settings />
              </SlideTransition>
            </ProtectedRoute>
          } />
          <Route path="/risk-signals" element={
            <ProtectedRoute>
              <SlideTransition>
                <RiskSignals />
              </SlideTransition>
            </ProtectedRoute>
          } />
          <Route path="/personal-details" element={
            <ProtectedRoute>
              <SlideTransition>
                <PersonalDetails />
              </SlideTransition>
            </ProtectedRoute>
          } />
          <Route path="/enter-name" element={
            <ProtectedRoute>
              <SlideTransition>
                <EnterName />
              </SlideTransition>
            </ProtectedRoute>
          } />
          <Route path="/daily-insights" element={
            <ProtectedRoute>
              <SlideTransition>
                <DailyInsights />
              </SlideTransition>
            </ProtectedRoute>
          } />
          <Route path="/hydration" element={
            <ProtectedRoute>
              <SlideTransition>
                <Hydration />
              </SlideTransition>
            </ProtectedRoute>
          } />
          <Route path="/manage-subscription" element={
            <ProtectedRoute>
              <SlideTransition>
                <ManageSubscription />
              </SlideTransition>
            </ProtectedRoute>
          } />
          
          <Route path="*" element={
            <PageTransition>
              <NotFound />
            </PageTransition>
          } />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
};
