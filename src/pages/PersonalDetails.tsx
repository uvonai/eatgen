import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Calendar, Ruler, Scale, Activity, Moon, Heart, Utensils, Pencil } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingData {
  gender: string | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: string | null;
  diet_type: string | null;
  stress_level: string | null;
  health_focus: string[] | null;
}

const PersonalDetails = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data: onboardingData } = await supabase
          .from("onboarding_data")
          .select("*")
          .eq("user_id", user.id)
          .single();

        setData(onboardingData);
      } catch (error) {
        console.warn("Failed to fetch personal details:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  const calculateAge = (birthDate: string | null) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const formatGender = (gender: string | null) => {
    if (!gender) return "Not specified";
    return gender.charAt(0).toUpperCase() + gender.slice(1).replace(/-/g, " ");
  };

  const age = calculateAge(data?.birth_date);

  // Format height for display (show in both units if available)
  const formatHeight = (heightCm: number | null) => {
    if (!heightCm) return "Not specified";
    const totalInches = heightCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${heightCm} cm (${feet}'${inches}")`;
  };

  // Format weight for display
  const formatWeight = (weightKg: number | null) => {
    if (!weightKg) return "Not specified";
    const lbs = Math.round(weightKg * 2.205);
    return `${weightKg} kg (${lbs} lbs)`;
  };

  // Mapping of fields to questionnaire steps for editing
  const editRoutes: Record<string, string> = {
    gender: "/questionnaire?edit=gender&returnTo=/personal-details",
    age: "/questionnaire?edit=age&returnTo=/personal-details",
    height: "/questionnaire?edit=height&returnTo=/personal-details",
    weight: "/questionnaire?edit=height&returnTo=/personal-details",
    activity: "/questionnaire?edit=activity&returnTo=/personal-details",
    diet: "/questionnaire?edit=diet&returnTo=/personal-details",
    stress: "/questionnaire?edit=stress&returnTo=/personal-details",
    health_focus: "/questionnaire?edit=focus&returnTo=/personal-details",
  };

  const handleEdit = (field: string) => {
    navigate(editRoutes[field] || "/questionnaire");
  };

  const details = [
    { icon: User, label: "Gender", value: formatGender(data?.gender), field: "gender" },
    { icon: Calendar, label: "Age", value: age ? `${age} years` : "Not specified", field: "age" },
    { icon: Ruler, label: "Height", value: formatHeight(data?.height_cm), field: "height" },
    { icon: Scale, label: "Weight", value: formatWeight(data?.weight_kg), field: "weight" },
    { icon: Activity, label: "Activity Level", value: data?.activity_level || "Not specified", field: "activity" },
    { icon: Utensils, label: "Diet Type", value: data?.diet_type || "Not specified", field: "diet" },
    { icon: Moon, label: "Stress Level", value: data?.stress_level || "Not specified", field: "stress" },
    { icon: Heart, label: "Health Focus", value: data?.health_focus?.join(", ") || "Not specified", field: "health_focus" },
  ];

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Header */}
      <header className="relative z-10 px-6 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 12px) + 12px)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/settings")}
            className="h-10 w-10 rounded-full bg-card/60 border border-border/40 flex items-center justify-center hover:bg-card/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-foreground text-2xl font-bold">Personal Details</h1>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-10 scrollbar-hide scroll-smooth will-change-scroll" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
          </div>
        ) : (
          <div className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm overflow-hidden">
            {details.map((detail, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 p-4 border-b border-border/30 last:border-b-0"
              >
                <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
                  <detail.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-muted-foreground text-xs">{detail.label}</p>
                  <p className="text-foreground font-medium">{detail.value}</p>
                </div>
                <button
                  onClick={() => handleEdit(detail.field)}
                  className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonalDetails;