import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  User,
  ChevronRight,
  FileText,
  Shield,
  Mail,
  MessageSquare,
  AlertTriangle,
  LogOut,
  Pencil,
  Sun,
  Moon,
  CreditCard,
  Sparkles,
  Trash2,
  Crown,
  Check,
  Calendar
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { safeSignOut, safeGetOnboardingData } from "@/lib/supabase-safe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useScanLimit } from "@/hooks/useScanLimit";
import { useRevenueCat, type SubscriptionStatus } from "@/hooks/useRevenueCat";
import { Paywall } from "@/components/Paywall";
import { Capacitor } from "@capacitor/core";

const CACHE_KEY_SETTINGS_PREFIX = "eatgen_settings_cache_";

const Settings = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthContext();
  const [activeTab, setActiveTab] = useState("settings");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  
  // Get premium status from scan limit hook
  const { isPremium, setPremium, loading: scanLimitLoading } = useScanLimit();
  
  // Get subscription details from RevenueCat
  const { subscriptionStatus, isIOSNative } = useRevenueCat();
  
  // Initialize with null - only load from cache when user is known
  const [userAge, setUserAge] = useState<number | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // Load cached data once user is available
  useEffect(() => {
    if (!user?.id) {
      setUserAge(null);
      setUserName(null);
      setIsDataLoaded(false);
      return;
    }

    // Always start in loading state when opening Settings / switching users.
    // We can still preload cached values, but we don't render them until the
    // background fetch resolves (prevents "old data" flashes).
    setIsDataLoaded(false);
    
    try {
      const cached = localStorage.getItem(`${CACHE_KEY_SETTINGS_PREFIX}${user.id}`);
      if (cached) {
        const data = JSON.parse(cached);
        setUserAge(data.userAge ?? null);
        setUserName(data.userName ?? null);
      }
    } catch {
      // Ignore cache errors
    }
  }, [user?.id]);

  // Initialize theme from localStorage or default to dark
  useEffect(() => {
    const savedTheme = localStorage.getItem("eatgen_theme");
    if (savedTheme === "light") {
      setIsDarkMode(false);
      document.documentElement.classList.remove("dark");
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  // Fetch user's data from profiles and onboarding - updates in background
  useEffect(() => {
    let isMounted = true;
    
    async function fetchUserData() {
      if (!user) return;
      
      try {
        // Fetch display name from profiles
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle();
        
        const newName = profileData?.display_name ?? null;
        
        // Fetch age from onboarding data
        const onboardingData = await safeGetOnboardingData(user.id);
        let newAge: number | null = null;
        
        if (onboardingData?.birth_date) {
          const birthDate = new Date(onboardingData.birth_date);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          newAge = age;
        }
        
        // Only update if still mounted and data is different from cache
        if (!isMounted) return;
        
        // Update state - React will batch these
        setUserName(newName);
        setUserAge(newAge);
        setIsDataLoaded(true);
        
        // Cache the data with user-specific key
        localStorage.setItem(`${CACHE_KEY_SETTINGS_PREFIX}${user.id}`, JSON.stringify({
          userName: newName,
          userAge: newAge,
        }));
      } catch (error) {
        console.warn("Failed to fetch user data:", error);
        setIsDataLoaded(true); // Still mark as loaded even on error
      }
    }
    
    if (!authLoading && user) {
      fetchUserData();
    }
    
    return () => { isMounted = false; };
  }, [user?.id, authLoading]); // Depend on user.id, not user object

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("eatgen_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("eatgen_theme", "light");
    }
  };

  const handleSupport = () => {
    window.location.href = "mailto:contact@uvonai.com";
  };

  const handleFeatureRequest = () => {
    window.open("https://docs.google.com/forms/d/e/1FAIpQLSe1OljYmIdqPuscxQTtGZSJoZ9MkU-WeXUYBZowX_mmd7qBiA/viewform?usp=dialog", "_blank");
  };

  const handleReportIssue = () => {
    window.open("https://docs.google.com/forms/d/e/1FAIpQLSfuFppAjdgK-9677YSzE0zG7NcgWF9y5gt7lVa55_4fZJIfnw/viewform?usp=publish-editor", "_blank");
  };

  const handleTerms = () => {
    window.open("https://sites.google.com/view/eatgenai-terms", "_blank");
  };

  const handlePrivacy = () => {
    window.open("https://sites.google.com/view/eatgen-privacy", "_blank");
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setIsDeleting(true);
    try {
      // Delete all user data from tables (wrapped individually for resilience)
      const safeDelete = async (table: string) => {
        try {
          await supabase.from(table as any).delete().eq('user_id', user.id);
        } catch (e) {
          console.warn(`Failed to delete from ${table}:`, e);
        }
      };
      
      await Promise.all([
        safeDelete('food_scans'),
        safeDelete('health_analysis'),
        safeDelete('onboarding_data'),
        safeDelete('user_limits'),
        safeDelete('profiles'),
      ]);
      
      // Clear local storage safely
      try {
        localStorage.clear();
      } catch (e) {
        console.warn('Failed to clear localStorage:', e);
      }
      
      // Sign out
      await safeSignOut();
      
      toast.success("Account deleted successfully");
      navigate("/auth", { replace: true });
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error("Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // No blocking loading screen - show cached data immediately

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Main Content - Endless scrolling */}
      <div className="relative z-10 flex-1 overflow-y-auto pb-40 scrollbar-hide will-change-scroll" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {/* Header */}
        <header className="px-6 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 12px)' }}>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Settings</h1>
        </header>

        {/* Profile Card */}
        <section className="px-5 mb-5">
          <div className="rounded-2xl bg-card/60 border border-border/40 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
                <User className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="flex-1">
                {authLoading || (!isDataLoaded && user) ? (
                  // Skeleton loading state
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => navigate("/enter-name")}
                      className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                    >
                      <span className="text-foreground font-semibold text-lg">
                        {userName || "Enter your name"}
                      </span>
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <span className="text-muted-foreground text-sm">
                      {userAge ? `${userAge} years old` : (user ? user.email : "Guest user")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Upgrade to Pro Card / Pro Status */}
        <section className="px-5 mb-5 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          {scanLimitLoading ? (
            <div className="rounded-2xl bg-card/60 border border-border/40 p-5 backdrop-blur-sm animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted/30 relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-32 bg-muted/30 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                  <div className="h-4 w-44 bg-muted/20 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                </div>
                <div className="h-6 w-6 rounded-md bg-muted/30 relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
              </div>
            </div>
          ) : isPremium ? (
            // Premium user - Show Pro badge
            <div className="rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-600/20 border border-amber-500/40 p-5 animate-scale-in">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600">
                  <Crown className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground font-bold text-lg">Eatgen Pro</h3>
                    <div className="rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Active
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm">Unlimited scans unlocked</p>
                </div>
                <Check className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          ) : (
            // Non-premium user - Show upgrade card
            <button
              onClick={() => setShowPaywall(true)}
              className="w-full rounded-2xl relative overflow-hidden border border-border/40 text-left active:scale-[0.98] transition-transform animate-scale-in"
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url('https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80')",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />

              <div className="relative z-10 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-white font-bold text-xl mb-1">Upgrade to Eatgen AI Pro</h3>
                <p className="text-white/80 text-sm">Unlock unlimited scans & advanced insights</p>
              </div>
            </button>
          )}
        </section>

        {/* Menu Items */}
        <section className="px-5 mb-5 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm overflow-hidden">
            <button
              onClick={() => navigate("/personal-details")}
              className="w-full flex items-center justify-between p-4 border-b border-border/30 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <User className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground font-medium">Personal Details</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
            {isPremium ? (
              // Premium user - Navigate to subscription management page
              <button
                onClick={() => navigate("/manage-subscription")}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
              >
                <div className="flex items-center gap-4">
                  <CreditCard className="w-5 h-5 text-amber-500" />
                  <span className="text-foreground font-medium">Manage Subscription</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                    Active
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </button>
            ) : (
              // Non-premium user - Show upgrade prompt
              <button
                onClick={() => setShowPaywall(true)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
              >
                <div className="flex items-center gap-4">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                  <span className="text-foreground font-medium">Manage Subscription</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </div>
        </section>

        {/* Appearance */}
        <section className="px-5 mb-5 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <div className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                {isDarkMode ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <span className="text-foreground font-medium block">Appearance</span>
                  <span className="text-muted-foreground text-sm">{isDarkMode ? "Dark mode" : "Light mode"}</span>
                </div>
              </div>
              <Switch 
                checked={isDarkMode} 
                onCheckedChange={toggleTheme}
                className="transition-transform active:scale-95"
              />
            </div>
          </div>
        </section>

        {/* Legal & Support */}
        <section className="px-5 mb-5 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm overflow-hidden">
            <button
              onClick={handleTerms}
              className="w-full flex items-center justify-between p-4 border-b border-border/30 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground font-medium">Terms and Conditions</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={handlePrivacy}
              className="w-full flex items-center justify-between p-4 border-b border-border/30 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground font-medium">Privacy Policy</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleSupport}
              className="w-full flex items-center justify-between p-4 border-b border-border/30 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground font-medium">Support</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleFeatureRequest}
              className="w-full flex items-center justify-between p-4 border-b border-border/30 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground font-medium">Feature Request</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleReportIssue}
              className="w-full flex items-center justify-between p-4 border-b border-border/30 hover:bg-muted/20 transition-all duration-150 active:bg-muted/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground font-medium">Report Issue</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors active:bg-muted/30"
                >
                  <div className="flex items-center gap-4">
                    <Trash2 className="w-5 h-5 text-rose-400" />
                    <span className="text-rose-400 font-medium">Delete Account</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-foreground">Delete Account?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    This action cannot be undone. All your data including meal logs, health scores, and personal information will be permanently deleted from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-muted text-foreground border-border">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="bg-rose-500 text-white hover:bg-rose-600"
                  >
                    {isDeleting ? "Deleting..." : "Delete Account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        {/* Logout */}
        <section className="px-5 mb-5">
          <button 
            onClick={async () => {
              const result = await safeSignOut();
              if (result.success) {
                toast.success("Logged out successfully");
                navigate("/auth");
              } else {
                toast.error(result.error || "Logout failed");
              }
            }}
            className="w-full rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm p-4 flex items-center gap-4 hover:bg-muted/20 transition-colors active:bg-muted/30"
          >
            <LogOut className="w-5 h-5 text-muted-foreground" />
            <span className="text-foreground font-medium">{user ? "Logout" : "Sign In"}</span>
          </button>
        </section>

        {/* Version */}
        <div className="text-center py-4">
          <span className="text-muted-foreground text-sm">VERSION 1.0.0</span>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Paywall Modal */}
      <Paywall
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribeSuccess={async () => {
          await setPremium(true);
          setShowPaywall(false);
        }}
      />
    </div>
  );
};

export default Settings;