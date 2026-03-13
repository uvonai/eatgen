import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { ScrollableMeter } from "@/components/ScrollableMeter";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  safeSaveOnboardingData,
  safeCalculateHealthScore,
  LOCAL_HEALTH_RESULTS_KEY,
  safeSignInAnonymously,
} from "@/lib/supabase-safe";

const TOTAL_STEPS = 18;

type Gender = "male" | "female" | "prefer-not-to-say" | null;
type Unit = "metric" | "imperial";

interface HealthResults {
  healthScore: number;
  energyStability: number;
  digestionScore: number;
  sleepScore: number;
  stressScore: number;
  hydrationScore: number;
  nutritionScore: number;
  calorieMin: number;
  calorieMax: number;
  habits: string[];
  insights: {
    bmi: number;
    bmiCategory: string;
    bmr: number;
    tdee: number;
    idealWeightMin: number;
    idealWeightMax: number;
    proteinNeedGrams: number;
    waterIntakeLiters: number;
    age: number;
  } | null;
  riskFactors: string[];
  strengths: string[];
  healthSummary: string;
  personalizedMessage: string;
}

export default function Questionnaire() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, checkOnboardingStatus } = useAuthContext();

  const [step, setStep] = useState(1);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Edit mode (used by Personal Details → edit field)
  const searchParams = new URLSearchParams(location.search);
  const edit = searchParams.get("edit");
  const returnTo = searchParams.get("returnTo") || "/personal-details";
  const isEditMode = Boolean(edit);

  const editStepMap: Record<string, number> = {
    gender: 1,
    focus: 2,
    age: 3,
    activity: 4,
    diet: 6,
    stress: 12,
    height: 15, // height + weight
  };

  useEffect(() => {
    if (!isEditMode) return;
    setStep(editStepMap[edit ?? ""] ?? 1);
  }, [isEditMode, edit]);

  // Question states
  const [gender, setGender] = useState<Gender>(null);
  const [primaryFocus, setPrimaryFocus] = useState<string | null>(null);
  const [activityLevel, setActivityLevel] = useState<string | null>(null);
  const [energyPattern, setEnergyPattern] = useState<string | null>(null);
  const [foodSource, setFoodSource] = useState<string | null>(null);
  const [eatingPattern, setEatingPattern] = useState<string | null>(null);
  const [mealsPerDay, setMealsPerDay] = useState<string | null>(null);
  const [afterMealFeeling, setAfterMealFeeling] = useState<string | null>(null);
  const [commonIssues, setCommonIssues] = useState<string[]>([]);
  const [sleepQuality, setSleepQuality] = useState<string | null>(null);
  const [stressLevel, setStressLevel] = useState<string | null>(null);
  const [whyUsingApp, setWhyUsingApp] = useState<string | null>(null);
  const [foodConfidence, setFoodConfidence] = useState<string | null>(null);

  const [birthYear, setBirthYear] = useState<string>("2000");
  const [birthMonth, setBirthMonth] = useState<string>("01");
  const [birthDay, setBirthDay] = useState<string>("01");
  const [unit, setUnit] = useState<Unit>("imperial");
  const [heightCm, setHeightCm] = useState<string>("170");
  const [heightFt, setHeightFt] = useState<string>("5");
  const [heightIn, setHeightIn] = useState<string>("6");
  const [weightKg, setWeightKg] = useState<string>("70");
  const [weightLbs, setWeightLbs] = useState<string>("150");

  // Health results from calculation
  const [healthResults, setHealthResults] = useState<HealthResults | null>(null);

  const calculateAge = () => {
    if (!birthYear || !birthMonth || !birthDay) return null;
    const today = new Date();
    const birthDate = new Date(parseInt(birthYear), parseInt(birthMonth) - 1, parseInt(birthDay));
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Build onboarding data object - RAW DATA ONLY, no calculations
  // All logic/calculations happen on backend
  const buildOnboardingData = () => {
    const birthDateStr = `${birthYear}-${birthMonth}-${birthDay}`;

    const toNumberOrNull = (value: string) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    // Convert imperial to metric if needed
    let finalHeightCm: number | null = null;
    let finalWeightKg: number | null = null;

    if (unit === "metric") {
      finalHeightCm = toNumberOrNull(heightCm);
      finalWeightKg = toNumberOrNull(weightKg);
    } else {
      // Convert feet/inches to cm: (ft * 12 + in) * 2.54
      const ft = toNumberOrNull(heightFt);
      const inches = toNumberOrNull(heightIn);
      if (ft !== null && inches !== null) {
        finalHeightCm = Math.round((ft * 12 + inches) * 2.54);
      }
      // Convert lbs to kg: lbs / 2.205
      const lbs = toNumberOrNull(weightLbs);
      if (lbs !== null) {
        finalWeightKg = Math.round((lbs / 2.205) * 10) / 10;
      }
    }

    // Save only columns that exist in the backend onboarding table.
    return {
      gender,
      birth_date: birthDateStr,
      activity_level: activityLevel,
      diet_type: eatingPattern,
      health_focus: primaryFocus ? [primaryFocus] : [],
      stress_level: stressLevel,
      height_cm: finalHeightCm,
      weight_kg: finalWeightKg,
    };
  };

  const age = calculateAge();
  const isUnder13 = age !== null && age <= 13;

  const canContinue = () => {
    switch (step) {
      case 1:
        return gender !== null;
      case 2:
        return primaryFocus !== null;
      case 3:
        return birthYear !== "" && birthMonth !== "" && birthDay !== "" && !isUnder13;
      case 4:
        return activityLevel !== null;
      case 5:
        return energyPattern !== null;
      case 6:
        return eatingPattern !== null;
      case 7:
        return foodSource !== null;
      case 8:
        return mealsPerDay !== null;
      case 9:
        return afterMealFeeling !== null;
      case 10:
        return true; // Multi-select can be empty
      case 11:
        return sleepQuality !== null;
      case 12:
        return stressLevel !== null;
      case 13:
        return whyUsingApp !== null;
      case 14:
        return foodConfidence !== null;
      case 15:
        return unit === "metric" ? heightCm !== "" && weightKg !== "" : heightFt !== "" && heightIn !== "" && weightLbs !== "";
      case 16:
        return true; // Account step - can skip
      case 17:
        return true; // Loading step
      case 18:
        return true; // Results step
      default:
        return false;
    }
  };

  const handleBack = () => {
    if (isEditMode) {
      navigate(returnTo);
      return;
    }

    if (step === 1) {
      navigate("/auth");
    } else {
      setStep(step - 1);
    }
  };

  const handleContinue = async () => {
    // Edit mode: update ONLY the selected field, then return to Personal Details.
    if (isEditMode) {
      if (!user) {
        navigate(returnTo, { replace: true });
        return;
      }

      const patch: Record<string, unknown> | null = (() => {
        switch (edit) {
          case "gender":
            return { gender };
          case "focus":
            return { health_focus: primaryFocus ? [primaryFocus] : [] };
          case "age":
            return { birth_date: `${birthYear}-${birthMonth}-${birthDay}` };
          case "activity":
            return { activity_level: activityLevel };
          case "diet":
            return { diet_type: eatingPattern };
          case "stress":
            return { stress_level: stressLevel };
          case "height": {
            const built = buildOnboardingData();
            return { height_cm: built.height_cm, weight_kg: built.weight_kg };
          }
          default:
            return null;
        }
      })();

      if (!patch) {
        navigate(returnTo, { replace: true });
        return;
      }

      try {
        setIsSavingEdit(true);
        await safeSaveOnboardingData(user.id, patch);
      } catch {
        // silent
      } finally {
        setIsSavingEdit(false);
      }

      navigate(returnTo, { replace: true });
      return;
    }

    if (step < TOTAL_STEPS) {
      // Skip Account step (16) if user is already authenticated
      if (step === 15 && user) {
        setStep(17); // Skip to loading step
      } else {
        setStep(step + 1);
      }
    } else {
      // IMPORTANT: await onboarding refresh so ProtectedRoute doesn't bounce back to step 1
      await checkOnboardingStatus();
      navigate("/home", { replace: true });
    }
  };

  const getButtonText = () => {
    if (isEditMode) return isSavingEdit ? "Saving..." : "Save";
    if (step === 3 && isUnder13) return "13 years or less is not allowed";
    if (step === 16) return "Skip";
    if (step === 18) return "Get Started";
    return "Continue";
  };

  // Handler for when loading completes - receives the calculated results
  const handleLoadingComplete = (results: HealthResults) => {
    setHealthResults(results);
    void handleContinue();
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col px-6 py-8 overflow-hidden" style={{ paddingTop: 'max(env(safe-area-inset-top), 2rem)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* Header - Hide on loading step */}
      {step !== 17 && (
        <div className="relative z-10 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] border border-white/10 text-white transition-all duration-200 active:scale-95 active:bg-white/10 hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          </button>
          {step === 18 ? (
            <button
              onClick={() => {
                const resultsEl = document.querySelector('[data-share-trigger]');
                if (resultsEl) (resultsEl as HTMLButtonElement).click();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] border border-white/10 text-white transition-all duration-200 active:scale-95 active:bg-white/10 hover:bg-white/[0.08]"
            >
              <Share2 className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : (
            <span className="font-display text-sm tracking-wide text-zinc-500">
              {step} / {TOTAL_STEPS}
            </span>
          )}
        </div>
      )}

      {/* Progress Bar - Hide on loading step */}
      {step !== 17 && (
        <div className="relative z-10 mt-6 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      )}

      {/* Content - Only allow scrolling on the final Results screen (per mobile UX requirement) */}
      <div
        className={`relative z-10 mt-8 flex-1 scrollbar-hide pb-28 ${
          step === 18 ? "overflow-y-auto scroll-smooth" : "overflow-hidden"
        }`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {step === 1 && <GenderStep gender={gender} setGender={setGender} />}
        {step === 2 && <PrimaryFocusStep value={primaryFocus} setValue={setPrimaryFocus} />}
        {step === 3 && (
          <AgeStep
            birthYear={birthYear}
            setBirthYear={setBirthYear}
            birthMonth={birthMonth}
            setBirthMonth={setBirthMonth}
            birthDay={birthDay}
            setBirthDay={setBirthDay}
            age={age}
          />
        )}
        {step === 4 && <ActivityLevelStep value={activityLevel} setValue={setActivityLevel} />}
        {step === 5 && <EnergyPatternStep value={energyPattern} setValue={setEnergyPattern} />}
        {step === 6 && <EatingPatternStep value={eatingPattern} setValue={setEatingPattern} />}
        {step === 7 && <FoodSourceStep value={foodSource} setValue={setFoodSource} />}
        {step === 8 && <MealsPerDayStep value={mealsPerDay} setValue={setMealsPerDay} />}
        {step === 9 && <AfterMealFeelingStep value={afterMealFeeling} setValue={setAfterMealFeeling} />}
        {step === 10 && <CommonIssuesStep values={commonIssues} setValues={setCommonIssues} />}
        {step === 11 && <SleepQualityStep value={sleepQuality} setValue={setSleepQuality} />}
        {step === 12 && <StressLevelStep value={stressLevel} setValue={setStressLevel} />}
        {step === 13 && <WhyUsingAppStep value={whyUsingApp} setValue={setWhyUsingApp} />}
        {step === 14 && <FoodConfidenceStep value={foodConfidence} setValue={setFoodConfidence} />}
        {step === 15 && (
          <HeightWeightStep
            unit={unit}
            setUnit={setUnit}
            heightCm={heightCm}
            setHeightCm={setHeightCm}
            heightFt={heightFt}
            setHeightFt={setHeightFt}
            heightIn={heightIn}
            setHeightIn={setHeightIn}
            weightKg={weightKg}
            setWeightKg={setWeightKg}
            weightLbs={weightLbs}
            setWeightLbs={setWeightLbs}
          />
        )}
        {step === 16 && <AccountStep onContinue={handleContinue} />}
        {step === 17 && (
          <LoadingStep onComplete={handleLoadingComplete} userId={user?.id} onboardingData={buildOnboardingData()} />
        )}
        {step === 18 && <ResultsStep results={healthResults} />}
      </div>


      {/* Continue Button - Fixed at bottom with safe area */}
      {step !== 17 && step !== 16 && step !== 18 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 px-6 bg-gradient-to-t from-black via-black/95 to-transparent pt-6"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <button
            onClick={handleContinue}
            disabled={!canContinue()}
            className={`w-full rounded-2xl py-4 font-display text-[15px] font-semibold tracking-wide transition-all duration-300 ease-out overflow-hidden ${
              canContinue()
                ? "bg-white text-black active:scale-[0.97] active:opacity-90"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            <span className="relative z-10">{getButtonText()}</span>
          </button>
        </div>
      )}

      {/* Step 18 CTA - truly fixed to viewport */}
      {step === 18 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 px-6 bg-gradient-to-t from-black via-black/95 to-transparent pt-6"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <button
            onClick={() => {
              void handleContinue();
            }}
            className="w-full rounded-2xl bg-white py-4 font-display text-[15px] font-semibold text-black tracking-wide transition-all duration-200 active:scale-[0.97] active:opacity-90"
          >
            Start Scanning Food
          </button>
        </div>
      )}
    </div>
  );
}

// Reusable Option Button Component - Apple Style
function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-2xl border px-5 py-4 text-left font-display text-[15px] font-medium tracking-wide transition-all duration-300 ease-out active:scale-[0.98] ${
        selected
          ? "border-white/30 bg-white text-black"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:border-white/15"
      }`}
    >
      <span className={`transition-transform duration-200 inline-block ${selected ? '' : 'group-active:translate-x-0.5'}`}>
        {children}
      </span>
    </button>
  );
}

// Multi-select Option Button - Apple Style
function MultiSelectButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-2xl border px-5 py-4 text-left font-display text-[15px] font-medium tracking-wide transition-all duration-300 ease-out flex items-center justify-between active:scale-[0.98] ${
        selected
          ? "border-white/30 bg-white text-black"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:border-white/15"
      }`}
    >
      <span className={`transition-transform duration-200 inline-block ${selected ? '' : 'group-active:translate-x-0.5'}`}>
        {children}
      </span>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
        selected 
          ? "bg-black border-black" 
          : "border-white/20 group-hover:border-white/30"
      }`}>
        {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </div>
    </button>
  );
}

function GenderStep({
  gender,
  setGender,
}: {
  gender: Gender;
  setGender: (g: Gender) => void;
}) {
  const options: { value: Gender; label: string }[] = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "prefer-not-to-say", label: "Others" },
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        Select your gender
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This helps us personalize your plan
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt.value}
            selected={gender === opt.value}
            onClick={() => setGender(opt.value)}
          >
            {opt.label}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function PrimaryFocusStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Build a healthier body",
    "Feel better day to day",
    "Improve energy & digestion",
    "Live longer with better habits",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        What matters most to you right now?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        Your primary focus helps us tailor your experience
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function ActivityLevelStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Mostly sitting",
    "Light movement (walking, chores)",
    "Moderate (3–4 workouts/week)",
    "Very active (5+ workouts or physical job)",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        How active are you in a typical week?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This helps us understand your energy needs
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function EnergyPatternStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Tired most of the day",
    "Normal",
    "Energetic",
    "Energy crashes after meals",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        How do you usually feel during the day?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        Understanding your energy patterns helps us personalize insights
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function FoodSourceStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Mostly home-cooked food",
    "Mix of home & outside food",
    "Mostly outside / packaged food",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        Where does most of your food come from?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This helps us understand your eating habits
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function EatingPatternStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Both vegetarian & non-vegetarian",
    "Mostly non-vegetarian (meat, fish, eggs)",
    "Vegetarian (no meat or fish)",
    "Vegan (no animal products)",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        What type of food do you usually eat?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This helps us understand your nutrition pattern
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function MealsPerDayStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = ["2–3 meals", "3–4 meals", "5+ small meals"];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        How many times do you eat in a day?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This helps us understand your digestion patterns
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function AfterMealFeelingStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Light & satisfied",
    "Heavy / sleepy",
    "Bloated",
    "Hungry again quickly",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        How do you usually feel after eating?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This tells us a lot about how food affects your body
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function CommonIssuesStep({
  values,
  setValues,
}: {
  values: string[];
  setValues: (v: string[]) => void;
}) {
  const options = [
    "Weight gain easily",
    "Fat around belly",
    "Sugar cravings",
    "Low stamina",
    "Poor sleep",
    "None",
  ];

  const toggleOption = (opt: string) => {
    if (opt === "None") {
      setValues(values.includes("None") ? [] : ["None"]);
    } else {
      const newValues = values.filter((v) => v !== "None");
      if (newValues.includes(opt)) {
        setValues(newValues.filter((v) => v !== opt));
      } else {
        setValues([...newValues, opt]);
      }
    }
  };

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        Do you experience any of these?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        Select all that apply
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <MultiSelectButton
            key={opt}
            selected={values.includes(opt)}
            onClick={() => toggleOption(opt)}
          >
            {opt}
          </MultiSelectButton>
        ))}
      </div>
    </div>
  );
}

function SleepQualityStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Poor (less than 6 hours)",
    "Average",
    "Good",
    "Very good",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        How is your sleep usually?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        Sleep quality affects your overall health
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function StressLevelStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = ["Low", "Moderate", "High"];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        How stressful is your daily life?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        Stress levels impact your health in many ways
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function WhyUsingAppStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "I don't trust food anymore",
    "I feel confused about what's healthy",
    "I want more energy & clarity",
    "I want to live longer and healthier",
    "Just curious",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        What made you try Eatgen AI?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This helps us understand what matters most to you
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function FoodConfidenceStep({
  value,
  setValue,
}: {
  value: string | null;
  setValue: (v: string) => void;
}) {
  const options = [
    "Very confident",
    "Somewhat confident",
    "Not confident",
    "I feel lost",
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        How confident are you about the food you eat?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        Be honest — there's no wrong answer
      </p>
      <div className="mt-10 flex flex-col gap-3">
        {options.map((opt) => (
          <OptionButton
            key={opt}
            selected={value === opt}
            onClick={() => setValue(opt)}
          >
            {opt}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function AgeStep({
  birthYear,
  setBirthYear,
  birthMonth,
  setBirthMonth,
  birthDay,
  setBirthDay,
  age,
}: {
  birthYear: string;
  setBirthYear: (y: string) => void;
  birthMonth: string;
  setBirthMonth: (m: string) => void;
  birthDay: string;
  setBirthDay: (d: string) => void;
  age: number | null;
}) {
  const months = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const days = Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: String(i + 1).padStart(2, "0"),
  }));

  const years = Array.from({ length: 110 }, (_, i) => ({
    value: String(2025 - i),
    label: String(2025 - i),
  }));

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        When were you born?
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This will be taken into account when calculating your daily nutrition goals.
      </p>

      <div className="mt-16 flex gap-2">
        <div className="flex-1">
          <ScrollableMeter
            items={months}
            selectedValue={birthMonth}
            onSelect={setBirthMonth}
          />
        </div>
        <div className="w-20">
          <ScrollableMeter
            items={days}
            selectedValue={birthDay}
            onSelect={setBirthDay}
          />
        </div>
        <div className="w-24">
          <ScrollableMeter
            items={years}
            selectedValue={birthYear}
            onSelect={setBirthYear}
          />
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          age !== null ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <p className="mt-4 text-center font-display text-[15px] tracking-wide text-zinc-300">
          You are <span className="font-semibold text-white">{age}</span> years old
        </p>
      </div>
    </div>
  );
}

function HeightWeightStep({
  unit,
  setUnit,
  heightCm,
  setHeightCm,
  heightFt,
  setHeightFt,
  heightIn,
  setHeightIn,
  weightKg,
  setWeightKg,
  weightLbs,
  setWeightLbs,
}: {
  unit: Unit;
  setUnit: (u: Unit) => void;
  heightCm: string;
  setHeightCm: (h: string) => void;
  heightFt: string;
  setHeightFt: (h: string) => void;
  heightIn: string;
  setHeightIn: (h: string) => void;
  weightKg: string;
  setWeightKg: (w: string) => void;
  weightLbs: string;
  setWeightLbs: (w: string) => void;
}) {
  const feet = Array.from({ length: 8 }, (_, i) => ({
    value: String(i + 2),
    label: `${i + 2} ft`,
  }));
  const inches = Array.from({ length: 12 }, (_, i) => ({
    value: String(i),
    label: `${i} in`,
  }));
  const lbs = Array.from({ length: 400 }, (_, i) => ({
    value: String(i + 50),
    label: `${i + 50} lb`,
  }));

  const cms = Array.from({ length: 150 }, (_, i) => ({
    value: String(i + 100),
    label: `${i + 100} cm`,
  }));
  const kgs = Array.from({ length: 200 }, (_, i) => ({
    value: String(i + 30),
    label: `${i + 30} kg`,
  }));

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white">
        Height & Weight
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500">
        This will be taken into account when calculating your daily nutrition goals.
      </p>

      <div className="mt-6 flex items-center justify-center gap-4">
        <span
          className={`font-display text-[16px] font-medium tracking-wide transition-all ${
            unit === "imperial" ? "text-white" : "text-zinc-500"
          }`}
        >
          Imperial
        </span>
        <button
          onClick={() => setUnit(unit === "imperial" ? "metric" : "imperial")}
          className={`relative h-8 w-14 rounded-full transition-all ${
            unit === "metric" ? "bg-white" : "bg-zinc-700"
          }`}
        >
          <div
            className={`absolute top-1 h-6 w-6 rounded-full bg-zinc-900 transition-all ${
              unit === "metric" ? "left-7" : "left-1"
            }`}
          />
        </button>
        <span
          className={`font-display text-[16px] font-medium tracking-wide transition-all ${
            unit === "metric" ? "text-white" : "text-zinc-500"
          }`}
        >
          Metric
        </span>
      </div>

      <div className="mt-6 flex">
        <div className={unit === "imperial" ? "flex-1" : "flex-1"}>
          <p className="text-center font-display text-[16px] font-semibold tracking-wide text-white">
            Height
          </p>
        </div>
        <div className="flex-1">
          <p className="text-center font-display text-[16px] font-semibold tracking-wide text-white">
            Weight
          </p>
        </div>
      </div>

      <div className="mt-8 flex gap-2">
        {unit === "imperial" ? (
          <>
            <div className="w-20">
              <ScrollableMeter
                items={feet}
                selectedValue={heightFt}
                onSelect={setHeightFt}
              />
            </div>
            <div className="w-20">
              <ScrollableMeter
                items={inches}
                selectedValue={heightIn}
                onSelect={setHeightIn}
              />
            </div>
            <div className="flex-1">
              <ScrollableMeter
                items={lbs}
                selectedValue={weightLbs}
                onSelect={setWeightLbs}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex-1">
              <ScrollableMeter
                items={cms}
                selectedValue={heightCm}
                onSelect={setHeightCm}
              />
            </div>
            <div className="flex-1">
              <ScrollableMeter
                items={kgs}
                selectedValue={weightKg}
                onSelect={setWeightKg}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}



function AccountStep({ onContinue }: { onContinue: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleContinueWithEmail = () => {
    navigate("/auth");
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
        setTimeout(() => resolve({ success: false, error: "Connection timed out. Please try again." }), 15000)
      );
      const result = await Promise.race([safeSignInAnonymously(), timeoutPromise]);
      
      if (result.success) {
        await new Promise((r) => setTimeout(r, 500));
        onContinue();
      } else {
        toast.error(result.error || "Guest sign in failed. Please check your connection.");
      }
    } catch (error) {
      console.error("Skip/guest sign in error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-white text-center">
        Create an account
      </h1>
      <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-500 text-center">
        Track progress over time
      </p>

      <div className="mt-10 w-full flex flex-col gap-3">
        {/* Continue with Email */}
        <button
          onClick={handleContinueWithEmail}
          disabled={isLoading}
          className="w-full rounded-2xl bg-white px-5 py-4 font-display text-[15px] font-medium tracking-wide text-black transition-all duration-200 hover:bg-zinc-100 active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {isLoading ? "Loading..." : "Continue with Email"}
        </button>

        {/* Skip (Guest account) */}
        <button
          onClick={handleSkip}
          disabled={isLoading}
          className="mx-auto mt-1 w-fit px-3 py-2 font-display text-[15px] font-medium tracking-wide text-zinc-300 transition-opacity hover:opacity-80 active:opacity-70 disabled:opacity-50"
        >
          {isLoading ? "Creating..." : "Skip"}
        </button>
      </div>
    </div>
  );
}

interface LoadingStepProps {
  onComplete: (results: HealthResults) => void;
  userId?: string;
  onboardingData: Record<string, unknown>;
}

// Default fallback results - defined OUTSIDE component to avoid recreation
const DEFAULT_LOADING_RESULTS: HealthResults = {
  healthScore: 68,
  energyStability: 65,
  digestionScore: 70,
  sleepScore: 55,
  stressScore: 55,
  hydrationScore: 60,
  nutritionScore: 60,
  calorieMin: 1800,
  calorieMax: 2200,
  habits: ["Scan your first meal to get personalized recommendations"],
  insights: null,
  riskFactors: [],
  strengths: ["You've taken the first step to better health!"],
  healthSummary: "Your health journey starts here!",
  personalizedMessage: "Let's work together to improve your health!",
};

function LoadingStep({ onComplete, userId, onboardingData }: LoadingStepProps) {
  const [progress, setProgress] = useState(0);
  const [textIndex, setTextIndex] = useState(0);
  const [healthResults, setHealthResults] = useState<HealthResults | null>(null);
  const [isDataReady, setIsDataReady] = useState(false);
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  const hasStartedProcessing = useRef(false);
  const hasCompleted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthResultsRef = useRef<HealthResults | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep refs in sync with state/props for use in timeout callbacks
  useEffect(() => {
    healthResultsRef.current = healthResults;
  }, [healthResults]);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  // Show "taking longer" message after 6 seconds
  useEffect(() => {
    const slowTimer = setTimeout(() => {
      setShowSlowMessage(true);
    }, 6000);

    return () => clearTimeout(slowTimer);
  }, []);

  const loadingTexts = [
    "Analyzing how food affects your body",
    "Identifying energy & digestion patterns",
    "Calculating your health balance",
    "Building your personalized health insights",
  ];

  // HARD FAILSAFE: No matter what happens, complete after 12 seconds max
  // This runs ONCE on mount and forces completion if nothing else works
  useEffect(() => {
    const hardFailsafe = setTimeout(() => {
      if (!hasCompleted.current) {
        console.warn("HARD FAILSAFE triggered - forcing completion");
        hasCompleted.current = true;
        const results = healthResultsRef.current || DEFAULT_LOADING_RESULTS;
        onCompleteRef.current(results);
      }
    }, 12000);

    return () => clearTimeout(hardFailsafe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Truly runs once - uses refs for latest values

  // Progress animation: NEVER hit 100% until data is actually ready.
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const target = isDataReady ? 100 : 92;
        if (prev >= target) return target; // Snap to target

        // Faster increment when data is ready to ensure we hit 100 quickly
        const step = isDataReady ? 10 : Math.max(0.5, (target - prev) * 0.05);
        const next = prev + step;
        return next >= target ? target : next; // Snap when close
      });
    }, 50);

    const textInterval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 1500);

    return () => {
      clearInterval(progressInterval);
      clearInterval(textInterval);
    };
  }, [isDataReady]);

  // Start backend call immediately (only once)
  useEffect(() => {
    if (hasStartedProcessing.current) return;
    hasStartedProcessing.current = true;

    // Safety timeout - if backend takes too long, use fallback
    timeoutRef.current = setTimeout(() => {
      console.warn("Health score calculation timeout - using fallback results");
      if (!isDataReady && !hasCompleted.current) {
        setHealthResults(DEFAULT_LOADING_RESULTS);
        setIsDataReady(true);
      }
    }, 10000); // 10 second timeout (faster)

    const processHealthData = async () => {
      try {
        console.log("Starting health score calculation...", { userId, hasOnboardingData: !!onboardingData });
        
        // Save onboarding data to database if user is logged in
        if (userId) {
          try {
            await safeSaveOnboardingData(userId, onboardingData);
            console.log("Onboarding data saved");
          } catch (saveError) {
            console.warn("Failed to save onboarding data (non-critical):", saveError);
          }
        }

        // Calculate health score on backend (with safety timeout)
        let result: any = null;
        try {
          result = await Promise.race([
            safeCalculateHealthScore({ userId, onboardingData }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Health score calculation timed out")), 8000)
            ),
          ]);
          console.log("Health score result:", result);
        } catch (calcError) {
          console.warn("Health score calculation failed:", calcError);
        }

        // Clear the safety timeout since we got a response
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        // If result is null or has an error, use fallback
        if (!result || result.error || !result.success) {
          console.warn("Using fallback results due to calculation issue");
          setHealthResults(DEFAULT_LOADING_RESULTS);
          setIsDataReady(true);
          return;
        }

        const results: HealthResults = {
          healthScore: result.health_score ?? 65,
          energyStability: result.energy_stability ?? 60,
          digestionScore: result.digestion_score ?? 70,
          sleepScore: result.sleep_score ?? 50,
          stressScore: result.stress_score ?? 50,
          hydrationScore: result.hydration_score ?? 50,
          nutritionScore: result.nutrition_score ?? 50,
          calorieMin: result.calorie_min ?? 1800,
          calorieMax: result.calorie_max ?? 2200,
          habits: result.habits ?? result.recommendations ?? ["Complete questionnaire for personalized habits"],
          insights: result.insights
            ? {
                bmi: result.insights.bmi,
                bmiCategory: result.insights.bmi_category,
                bmr: result.insights.bmr,
                tdee: result.insights.tdee,
                idealWeightMin: result.insights.ideal_weight_min,
                idealWeightMax: result.insights.ideal_weight_max,
                proteinNeedGrams: result.insights.protein_need_grams,
                waterIntakeLiters: result.insights.water_intake_liters,
                age: result.insights.age,
              }
            : null,
          riskFactors: result.risk_factors ?? [],
          strengths: result.strengths ?? [],
          healthSummary: result.health_summary ?? "Your health profile is ready!",
          personalizedMessage: result.personalized_message ?? "Let's improve your health together!",
        };

        // Cache the last backend-calculated score locally (so Home can show it even for guest users)
        try {
          localStorage.setItem(
            LOCAL_HEALTH_RESULTS_KEY,
            JSON.stringify({
              version: 1,
              savedAt: new Date().toISOString(),
              healthScore: results.healthScore,
              healthSummary: results.healthSummary,
              recommendations: results.habits,
            })
          );
        } catch {
          // non-critical
        }

        setHealthResults(results);
        setIsDataReady(true);
      } catch (error) {
        console.error("Error processing health data:", error);
        
        // Clear the safety timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // Use fallback results on any error
        setHealthResults(DEFAULT_LOADING_RESULTS);
        setIsDataReady(true);
      }
    };

    processHealthData();

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [userId, onboardingData]);

  // Navigate to results after progress ACTUALLY reaches 100
  useEffect(() => {
    if (!isDataReady) return;
    if (!healthResults) return;
    if (hasCompleted.current) return;

    // Data is ready - force progress to 100 and complete
    hasCompleted.current = true;
    setProgress(100);
    
    // Small delay for visual polish
    const t = setTimeout(() => {
      console.log("Data ready, calling onComplete with results");
      onCompleteRef.current(healthResults);
    }, 300);
    return () => clearTimeout(t);
  }, [isDataReady, healthResults]);

  const displayProgress = Math.round(progress);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#gradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${displayProgress * 2.83} 283`}
            className="transition-all duration-100"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-2xl font-bold text-white">{displayProgress}%</span>
        </div>
      </div>

      <p className="mt-8 font-display text-[16px] tracking-wide text-zinc-300 text-center min-h-[24px] transition-all">
        {loadingTexts[textIndex]}
      </p>
      
      {/* Slow loading indicator */}
      {showSlowMessage && !isDataReady && (
        <p className="mt-4 text-zinc-500 text-center text-sm font-display animate-fade-in">
          Taking longer than expected...
        </p>
      )}
    </div>
  );
}

interface ResultsStepProps {
  results: HealthResults | null;
}

async function generateHealthScoreCard(results: HealthResults): Promise<Blob> {
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0a0a");
  bg.addColorStop(0.5, "#0d1117");
  bg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grain texture
  for (let i = 0; i < 15000; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Score circle
  const cx = W / 2, cy = 460, r = 180;
  const score = results.healthScore ?? 65;

  // Glow behind circle
  const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2);
  glow.addColorStop(0, "rgba(6,182,212,0.15)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, cy - r * 2, W, r * 4);

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 18;
  ctx.stroke();

  // Score arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (score / 100) * Math.PI * 2;
  const arcGrad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  arcGrad.addColorStop(0, "#06b6d4");
  arcGrad.addColorStop(0.5, "#3b82f6");
  arcGrad.addColorStop(1, "#8b5cf6");
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = arcGrad;
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.stroke();

  // Score text
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 96px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(String(score), cx, cy + 32);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("/100", cx + 70, cy + 32);

  // "Your Life Score" title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("Your Life Score", cx, 200);

  // Label badge
  const getLabel = (s: number) => s >= 85 ? "🌟 Excellent!" : s >= 75 ? "💪 Looking Good!" : s >= 65 ? "✨ Good Start!" : "🌱 Room to Grow";
  ctx.font = "28px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#06b6d4";
  ctx.fillText(getLabel(score), cx, cy + r + 60);

  // Personalized message
  const msg = results.personalizedMessage || "Great start! Your journey to better health begins now.";
  ctx.font = "26px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  // Word wrap
  const words = msg.split(" ");
  let line = "", lineY = cy + r + 120;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > W - 160) {
      ctx.fillText(line.trim(), cx, lineY);
      line = word + " ";
      lineY += 38;
    } else {
      line = test;
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), cx, lineY);

  // Insights cards
  let cardY = lineY + 80;
  const insights = results.insights;
  if (insights) {
    const cards = [
      { label: "Daily Calories", value: `${Math.round(insights.tdee || insights.bmr || 2000)}`, unit: "kcal" },
      { label: "Protein Goal", value: `${insights.proteinNeedGrams || 60}g`, unit: "per day" },
      { label: "Water Intake", value: `${insights.waterIntakeLiters || 2.5}L`, unit: "per day" },
      { label: "BMI", value: `${(insights.bmi || 22).toFixed(1)}`, unit: insights.bmiCategory || "Normal" },
    ];

    const cw = 220, ch = 140, gap = 30;
    const startX = (W - (cw * 2 + gap)) / 2;

    cards.forEach((card, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = startX + col * (cw + gap);
      const y = cardY + row * (ch + gap);

      // Card bg
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      const rr = 20;
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + cw - rr, y);
      ctx.quadraticCurveTo(x + cw, y, x + cw, y + rr);
      ctx.lineTo(x + cw, y + ch - rr);
      ctx.quadraticCurveTo(x + cw, y + ch, x + cw - rr, y + ch);
      ctx.lineTo(x + rr, y + ch);
      ctx.quadraticCurveTo(x, y + ch, x, y + ch - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.fill();

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "20px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(card.label.toUpperCase(), x + cw / 2, y + 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 40px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(card.value, x + cw / 2, y + 85);
      ctx.fillStyle = "#06b6d4";
      ctx.font = "18px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(card.unit, x + cw / 2, y + 115);
    });

    cardY += (ch + gap) * 2 + 40;
  }

  // Strengths
  if (results.strengths?.length) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#06b6d4";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("💪 Strengths", 80, cardY);
    cardY += 44;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "24px -apple-system, BlinkMacSystemFont, sans-serif";
    results.strengths.slice(0, 3).forEach(s => {
      ctx.fillText(`• ${s}`, 100, cardY);
      cardY += 36;
    });
    cardY += 20;
  }

  // Habits
  if (results.habits?.length) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("💡 Quick Wins", 80, cardY);
    cardY += 44;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "24px -apple-system, BlinkMacSystemFont, sans-serif";
    results.habits.slice(0, 3).forEach(h => {
      ctx.fillText(`• ${h}`, 100, cardY);
      cardY += 36;
    });
  }

  // Watermark
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("Eatgen AI", cx, H - 80);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.font = "20px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("eatgen.app", cx, H - 45);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

function ResultsStep({ results }: ResultsStepProps) {
  const [isSharing, setIsSharing] = useState(false);

  // Score comes pre-clamped (60-70) from backend
  const healthScore = results?.healthScore ?? 65;
  const habits = results?.habits ?? [];
  const insights = results?.insights;
  const strengths = results?.strengths ?? [];
  const personalizedMessage =
    results?.personalizedMessage ?? "Great start! Your journey to better health begins now.";

  // Calculate potential score (what they could achieve)
  const potentialScore = Math.min(98, healthScore + 25);

  // Get encouraging label based on score
  const getScoreLabel = (score: number) => {
    if (score >= 85) return { label: "Excellent!", emoji: "🌟" };
    if (score >= 75) return { label: "Looking Good!", emoji: "💪" };
    if (score >= 65) return { label: "Good Start!", emoji: "✨" };
    return { label: "Room to Grow", emoji: "🌱" };
  };

  const scoreInfo = getScoreLabel(healthScore);

  const handleShare = async () => {
    if (!results || isSharing) return;
    setIsSharing(true);
    try {
      const blob = await generateHealthScoreCard(results);
      const file = new File([blob], "life-score.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Life Score - Eatgen AI" });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "life-score.png";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Image saved!");
      }
    } catch (e: any) {
      if (!e?.message?.includes("cancel") && !e?.message?.includes("abort")) {
        toast.error("Sharing failed");
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Derive weaknesses from questionnaire answers via risk factors
  const riskFactors = results?.riskFactors ?? [];
  
  // Build answer-based weaknesses from the results
  const weaknesses: string[] = [];
  riskFactors.forEach(r => {
    if (!weaknesses.includes(r)) weaknesses.push(r);
  });

  // Derive additional context-aware weaknesses from scores
  if (results) {
    if ((results.stressScore ?? 100) < 60 && !weaknesses.some(w => w.toLowerCase().includes('stress')))
      weaknesses.push('High stress levels affecting overall health');
    if ((results.sleepScore ?? 100) < 60 && !weaknesses.some(w => w.toLowerCase().includes('sleep')))
      weaknesses.push('Poor sleep quality impacting recovery');
    if ((results.hydrationScore ?? 100) < 60 && !weaknesses.some(w => w.toLowerCase().includes('hydra') || w.toLowerCase().includes('water')))
      weaknesses.push('Insufficient daily hydration');
    if ((results.nutritionScore ?? 100) < 60 && !weaknesses.some(w => w.toLowerCase().includes('nutri') || w.toLowerCase().includes('diet')))
      weaknesses.push('Nutrition balance needs improvement');
    if ((results.energyStability ?? 100) < 60 && !weaknesses.some(w => w.toLowerCase().includes('energy')))
      weaknesses.push('Unstable energy levels throughout the day');
    if ((results.digestionScore ?? 100) < 60 && !weaknesses.some(w => w.toLowerCase().includes('digest')))
      weaknesses.push('Digestive health could be better');
  }

  return (
    <div className="flex flex-col pb-40">
      {/* Hidden share trigger for header button */}
      <button data-share-trigger onClick={handleShare} disabled={isSharing} className="hidden" />

      {/* Celebratory Hero Section */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 mb-4">
          <span className="text-2xl">{scoreInfo.emoji}</span>
          <span className="font-display text-[13px] font-medium text-cyan-400">{scoreInfo.label}</span>
        </div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-white">
          Your Life Score
        </h1>
        <p className="mt-2 font-display text-[14px] tracking-wide text-zinc-400">
          Based on your lifestyle & habits
        </p>
      </div>

      {/* Main Life Score - Hero Visual */}
      <div className="relative rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-violet-500/10 to-indigo-500/10 p-8 mb-6 overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl" />
        
        <div className="relative text-center">
          <div className="inline-block">
            <span className="font-display text-[72px] font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent leading-none">
              {healthScore}
            </span>
            <span className="font-display text-[24px] text-zinc-500 ml-1">/100</span>
          </div>
          
          {/* Progress ring visual */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 transition-all duration-1000"
              style={{ width: `${healthScore}%` }}
            />
          </div>
          
          <p className="mt-4 font-display text-[15px] text-zinc-300 leading-relaxed">
            {personalizedMessage}
          </p>
        </div>
      </div>

      {/* What Your Score Means */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-4">
        <h3 className="font-display text-[15px] font-semibold text-white mb-3">
          What does this mean?
        </h3>
        <p className="font-display text-[13px] text-zinc-400 leading-relaxed">
          Your Life Score reflects your overall health based on your sleep, stress, diet, and activity levels. 
          {healthScore >= 75 
            ? " You're doing great! Small improvements can help you reach your full potential."
            : " You have a solid foundation, and with the right food choices, you can significantly boost your score."
          }
        </p>
      </div>

      {/* How to Improve Your Life Score - KEY CARD */}
      <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20">
            <span className="text-xl">🚀</span>
          </div>
          <h3 className="font-display text-[16px] font-semibold text-white">
            How to Improve Your Life Score
          </h3>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-[12px] font-bold shrink-0 mt-0.5">1</div>
            <div>
              <p className="font-display text-[14px] text-white font-medium">Scan your food before eating</p>
              <p className="font-display text-[12px] text-zinc-400 mt-1">Use the camera to check what's really in your food</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-[12px] font-bold shrink-0 mt-0.5">2</div>
            <div>
              <p className="font-display text-[14px] text-white font-medium">Choose foods that help, not hurt</p>
              <p className="font-display text-[12px] text-zinc-400 mt-1">We'll tell you if something is good or bad for you</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-[12px] font-bold shrink-0 mt-0.5">3</div>
            <div>
              <p className="font-display text-[14px] text-white font-medium">Watch your score go up</p>
              <p className="font-display text-[12px] text-zinc-400 mt-1">Small daily choices add up to big changes</p>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <span className="font-display text-[13px] text-zinc-400">Your potential score</span>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-[24px] font-bold text-emerald-400">{potentialScore}</span>
              <span className="text-zinc-500 text-[14px]">/100</span>
            </div>
          </div>
          <p className="mt-2 font-display text-[12px] text-emerald-400/80 italic">
            Just by making smarter food choices, you could reach {potentialScore} points!
          </p>
        </div>
      </div>

      {/* Your Personalized Insights */}
      {insights && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-4">
          <h3 className="font-display text-[15px] font-semibold text-white mb-4">
            Your Personalized Targets
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="font-display text-[11px] text-zinc-500 uppercase">Daily Calories</p>
              <p className="font-display text-[22px] font-bold text-white mt-1">{insights.bmr ? Math.round(insights.tdee || insights.bmr) : '2000'}</p>
              <p className="font-display text-[10px] text-cyan-400">kcal/day</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="font-display text-[11px] text-zinc-500 uppercase">Protein Goal</p>
              <p className="font-display text-[22px] font-bold text-white mt-1">{insights.proteinNeedGrams || '60'}g</p>
              <p className="font-display text-[10px] text-cyan-400">per day</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="font-display text-[11px] text-zinc-500 uppercase">Water Intake</p>
              <p className="font-display text-[22px] font-bold text-white mt-1">{insights.waterIntakeLiters || '2.5'}L</p>
              <p className="font-display text-[10px] text-cyan-400">per day</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <p className="font-display text-[11px] text-zinc-500 uppercase">Ideal Weight</p>
              <p className="font-display text-[22px] font-bold text-white mt-1">{insights.idealWeightMin}-{insights.idealWeightMax}</p>
              <p className="font-display text-[10px] text-cyan-400">kg</p>
            </div>
          </div>
        </div>
      )}

      {/* What You're Not Doing Well */}
      {weaknesses.length > 0 && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <span className="font-display text-[14px] font-semibold text-white">Areas to improve</span>
          </div>
          <div className="space-y-2.5">
            {weaknesses.slice(0, 4).map((weakness, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
                <span className="font-display text-[13px] text-zinc-300">{weakness}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What You're Doing Well */}
      {strengths.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💪</span>
            <span className="font-display text-[14px] font-semibold text-white">What you're doing well</span>
          </div>
          <div className="space-y-2.5">
            {strengths.slice(0, 4).map((strength, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-display text-[13px] text-zinc-300">{strength}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Wins to Try */}
      {habits.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💡</span>
            <span className="font-display text-[14px] font-semibold text-white">Quick wins to try</span>
          </div>
          <div className="space-y-2">
            {habits.slice(0, 3).map((habit, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="font-display text-[13px] text-zinc-300">{habit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Motivational CTA */}
      <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6 mb-4 text-center">
        <span className="text-3xl">🎯</span>
        <h3 className="mt-3 font-display text-[17px] font-semibold text-white">
          Ready to see what's in your food?
        </h3>
        <p className="mt-2 font-display text-[13px] text-zinc-400 leading-relaxed">
          Just point your camera at any meal, snack, or packaged food. 
          We'll instantly tell you if it's helping or hurting your health.
        </p>
        <p className="mt-4 font-display text-[12px] text-violet-400 italic">
          "The first step to eating better is knowing what you eat."
        </p>
      </div>

    </div>
  );
}
