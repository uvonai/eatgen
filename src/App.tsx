import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import AuthBackground from "@/components/AuthBackground";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { BackButtonHandler } from "@/components/BackButtonHandler";
import { RevenueCatProvider } from "@/components/RevenueCatProvider";
import { SubscriptionGuard } from "@/components/SubscriptionGuard";
import { AnimatedRoutes } from "@/components/AnimatedRoutes";
import { OptimisticMealProvider } from "@/contexts/OptimisticMealContext";

// Create query client with safe defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <RevenueCatProvider>
          <OptimisticMealProvider>
            <ErrorBoundary>
              <BrowserRouter>
                <BackButtonHandler />
                <SubscriptionGuard />
                <AuthBackground />
                <OfflineIndicator />
                <Toaster position="top-center" richColors />
                <AnimatedRoutes />
              </BrowserRouter>
            </ErrorBoundary>
          </OptimisticMealProvider>
        </RevenueCatProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
