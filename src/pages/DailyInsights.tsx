import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Heart, Zap, Moon, Droplets, Brain, Flame } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { safeGetOnboardingData } from "@/lib/supabase-safe";

interface Insight {
  id: number;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
}

const DailyInsights = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function generateInsights() {
      setLoading(true);
      
      try {
        // Get user data for personalized insights
        let userData = null;
        if (user) {
          userData = await safeGetOnboardingData(user.id);
        }

        // Generate daily insights based on date and user data
        const today = new Date();
        const dayOfWeek = today.getDay();
        const dateHash = today.getDate() + today.getMonth() * 31;

        // Personalized insight pool
        const allInsights: Insight[] = [
          {
            id: 1,
            icon: Heart,
            title: "Heart Health Tip",
            description: "Including fiber-rich foods like oats and beans can help lower cholesterol levels naturally.",
            color: "rose"
          },
          {
            id: 2,
            icon: Zap,
            title: "Energy Boost",
            description: "Complex carbs in the morning provide sustained energy. Try whole grain toast with avocado.",
            color: "amber"
          },
          {
            id: 3,
            icon: Moon,
            title: "Better Sleep",
            description: "Avoid heavy meals 3 hours before bed. Light snacks with tryptophan like almonds can help.",
            color: "indigo"
          },
          {
            id: 4,
            icon: Droplets,
            title: "Stay Hydrated",
            description: "Drinking water before meals can help with portion control and improve digestion.",
            color: "cyan"
          },
          {
            id: 5,
            icon: Brain,
            title: "Brain Food",
            description: "Omega-3 fatty acids in salmon and walnuts support cognitive function and memory.",
            color: "purple"
          },
          {
            id: 6,
            icon: Flame,
            title: "Metabolism Tip",
            description: "Protein requires more energy to digest, helping boost your metabolic rate naturally.",
            color: "orange"
          },
          {
            id: 7,
            icon: Heart,
            title: "Blood Sugar Control",
            description: "Pairing carbs with protein or healthy fats slows glucose absorption.",
            color: "emerald"
          },
          {
            id: 8,
            icon: Sparkles,
            title: "Mindful Eating",
            description: "Eating slowly and without distractions helps you recognize fullness cues.",
            color: "violet"
          },
          {
            id: 9,
            icon: Zap,
            title: "Pre-Workout Fuel",
            description: "A banana 30 minutes before exercise provides quick energy and potassium.",
            color: "yellow"
          },
          {
            id: 10,
            icon: Moon,
            title: "Recovery Foods",
            description: "Post-workout, combine protein and carbs within 30 minutes for optimal recovery.",
            color: "blue"
          },
        ];

        // Select 4-5 insights based on the date (rotates daily)
        const shuffled = [...allInsights].sort((a, b) => {
          const hashA = (a.id * dateHash) % 100;
          const hashB = (b.id * dateHash) % 100;
          return hashA - hashB;
        });

        const selectedInsights = shuffled.slice(0, 5);
        setInsights(selectedInsights);
      } catch (error) {
        console.warn("Failed to generate insights:", error);
        // Default insights if something fails
        setInsights([
          {
            id: 1,
            icon: Heart,
            title: "Eat Mindfully",
            description: "Take time to enjoy your meals without distractions for better digestion.",
            color: "rose"
          },
          {
            id: 2,
            icon: Droplets,
            title: "Stay Hydrated",
            description: "Aim for 8 glasses of water daily for optimal health.",
            color: "cyan"
          },
        ]);
      } finally {
        setLoading(false);
      }
    }

    generateInsights();
  }, [user]);

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; icon: string; border: string }> = {
      rose: { bg: "bg-rose-500/10", icon: "text-rose-400", border: "border-rose-500/20" },
      amber: { bg: "bg-amber-500/10", icon: "text-amber-400", border: "border-amber-500/20" },
      indigo: { bg: "bg-indigo-500/10", icon: "text-indigo-400", border: "border-indigo-500/20" },
      cyan: { bg: "bg-cyan-500/10", icon: "text-cyan-400", border: "border-cyan-500/20" },
      purple: { bg: "bg-purple-500/10", icon: "text-purple-400", border: "border-purple-500/20" },
      orange: { bg: "bg-orange-500/10", icon: "text-orange-400", border: "border-orange-500/20" },
      emerald: { bg: "bg-emerald-500/10", icon: "text-emerald-400", border: "border-emerald-500/20" },
      violet: { bg: "bg-violet-500/10", icon: "text-violet-400", border: "border-violet-500/20" },
      yellow: { bg: "bg-yellow-500/10", icon: "text-yellow-400", border: "border-yellow-500/20" },
      blue: { bg: "bg-blue-500/10", icon: "text-blue-400", border: "border-blue-500/20" },
    };
    return colors[color] || colors.emerald;
  };

  return (
    <div 
      className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >

      {/* Header - fixed height */}
      <header className="relative z-10 px-6 pb-6 flex-shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top, 12px) + 12px)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/home")}
            className="h-10 w-10 rounded-full bg-card/60 border border-border/40 flex items-center justify-center hover:bg-card/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-foreground text-2xl font-bold">Daily Insights</h1>
          </div>
        </div>
      </header>

      {/* Content - scrollable area with proper padding */}
      <div 
        className="relative z-10 flex-1 overflow-y-auto px-5 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {loading ? (
          // Premium skeleton loading with stagger and shimmer
          <div className="space-y-4 pb-20">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm p-5 animate-pulse"
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted/30 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="h-5 w-32 bg-muted/30 rounded relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                    <div className="h-3 w-full bg-muted/20 rounded relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                    <div className="h-3 w-3/4 bg-muted/20 rounded relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 pb-20">
            {insights.map((insight, idx) => {
              const colors = getColorClasses(insight.color);
              return (
                <div
                  key={insight.id}
                  className={`rounded-2xl ${colors.bg} border ${colors.border} backdrop-blur-sm p-5 animate-slide-up`}
                  style={{ animationDelay: `${idx * 0.08}s` }}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
                      <insight.icon className={`w-6 h-6 ${colors.icon}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-foreground font-semibold text-lg mb-1">{insight.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{insight.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyInsights;