import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * PRODUCTION-READY DAILY SUMMARY EDGE FUNCTION
 * - JWT authentication verification
 * - Per-user data isolation (fetches ONLY authenticated user's data)
 * - All calculations done on backend
 * - Robust error handling
 * - Safe defaults for missing data
 */

interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] get-daily-summary: Request received`);

  try {
    // ========== JWT AUTHENTICATION ==========
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[${requestId}] Missing or invalid authorization header`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error(`[${requestId}] Supabase credentials not configured`);
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth token for verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the JWT and get authenticated user
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.warn(`[${requestId}] Invalid or expired token`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authenticatedUserId = claimsData.claims.sub as string;
    console.log(`[${requestId}] Authenticated user: ${authenticatedUserId.substring(0, 8)}...`);

    // ========== PARSE REQUEST BODY ==========
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error(`[${requestId}] Invalid JSON body`);
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { date, timezoneOffset } = body as { date?: string; timezoneOffset?: number };

    // Use service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's timezone offset (in minutes, e.g., -330 for IST which is UTC+5:30)
    // Validate timezone offset range (-720 to +840 minutes = UTC-12 to UTC+14)
    const userOffsetMinutes = typeof timezoneOffset === 'number' 
      ? Math.max(-720, Math.min(840, Math.round(timezoneOffset)))
      : 0;

    // Calculate user's local day boundaries in UTC
    const nowUtc = date ? new Date(date) : new Date();
    if (isNaN(nowUtc.getTime())) {
      nowUtc.setTime(Date.now());
    }
    
    const userLocalTime = new Date(nowUtc.getTime() - userOffsetMinutes * 60 * 1000);
    const userLocalDayStart = new Date(userLocalTime);
    userLocalDayStart.setUTCHours(0, 0, 0, 0);
    
    const dayStartUtc = new Date(userLocalDayStart.getTime() + userOffsetMinutes * 60 * 1000);
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    console.log(`[${requestId}] Fetching summary for authenticated user`);

    // Fetch ONLY authenticated user's meals (per-user isolation)
    const { data: meals, error: mealsError } = await supabase
      .from('food_scans')
      .select('id, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, health_impact, scanned_at, image_url, ai_analysis')
      .eq('user_id', authenticatedUserId)  // Use verified auth user ID
      .gte('scanned_at', dayStartUtc.toISOString())
      .lt('scanned_at', dayEndUtc.toISOString())
      .order('scanned_at', { ascending: false })
      .limit(100);

    if (mealsError) {
      console.error(`[${requestId}] Error fetching meals:`, mealsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch meals' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Daily targets (can be personalized based on user profile in future)
    const dailyTargets: DailyTargets = {
      calories: 2000,
      protein: 120,
      carbs: 250,
      fat: 65,
      fiber: 30,
      sugar: 50,
      sodium: 2300,
    };

    // Calculate consumed macros from meals (ALL CALCULATIONS ON BACKEND)
    const safeMeals = meals || [];

    const getAnalysisNumber = (meal: any, key: string) => {
      const raw = (meal?.ai_analysis as any)?.[key];
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : 0;
    };

    const consumedMacros = safeMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (typeof meal.calories === 'number' ? meal.calories : 0),
        protein: acc.protein + (typeof meal.protein_g === 'number' ? meal.protein_g : 0),
        carbs: acc.carbs + (typeof meal.carbs_g === 'number' ? meal.carbs_g : 0),
        fat: acc.fat + (typeof meal.fat_g === 'number' ? meal.fat_g : 0),
        fiber: acc.fiber + (typeof meal.fiber_g === 'number' ? meal.fiber_g : 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );

    const consumedSugar = safeMeals.reduce((sum, meal) => sum + getAnalysisNumber(meal, 'sugar_g'), 0);
    const consumedSodium = safeMeals.reduce((sum, meal) => sum + getAnalysisNumber(meal, 'sodium_mg'), 0);

    // Calculate remaining macros (ensure non-negative)
    const remainingMacros = {
      calories: Math.max(0, dailyTargets.calories - consumedMacros.calories),
      protein: Math.max(0, dailyTargets.protein - consumedMacros.protein),
      carbs: Math.max(0, dailyTargets.carbs - consumedMacros.carbs),
      fat: Math.max(0, dailyTargets.fat - consumedMacros.fat),
      fiber: Math.max(0, dailyTargets.fiber - consumedMacros.fiber),
      sugar: Math.max(0, Math.round(dailyTargets.sugar - consumedSugar)),
      sodium: Math.max(0, Math.round(dailyTargets.sodium - consumedSodium)),
    };

    // Calculate impact data
    const mealCount = safeMeals.length;
    const goodMeals = safeMeals.filter(m => m.health_impact === 'good').length;
    const riskyMeals = safeMeals.filter(m => m.health_impact === 'risky').length;

    // Calculate net lifespan impact from all logged foods
    let totalLifespanDays = 0;
    safeMeals.forEach(meal => {
      const analysis = meal.ai_analysis as any;
      if (analysis?.lifespan_impact?.days) {
        totalLifespanDays += Number(analysis.lifespan_impact.days) || 0;
      } else if (analysis?.lifespan_impact_days) {
        totalLifespanDays += Number(analysis.lifespan_impact_days) || 0;
      }
    });

    // Generate impact cards (pre-calculated for frontend display)
    const impactCards = [
      {
        id: 1,
        title: "Food Impact",
        value: mealCount === 0 
          ? "0 days"
          : totalLifespanDays >= 0 
            ? (totalLifespanDays > 0 ? `+${totalLifespanDays.toFixed(1)} days` : "0 days") 
            : `${totalLifespanDays.toFixed(1)} days`,
        subtext: mealCount === 0 
          ? "No meals logged yet" 
          : totalLifespanDays >= 0 
            ? `${goodMeals} healthy choice${goodMeals !== 1 ? 's' : ''} today`
            : `${riskyMeals} risky choice${riskyMeals !== 1 ? 's' : ''} today`,
        type: "food",
        color: totalLifespanDays >= 0 ? "emerald" : "rose",
        unit: "days",
      },
      {
        id: 2,
        title: "Calories Today",
        value: String(consumedMacros.calories),
        subtext: consumedMacros.calories > 0 ? `${remainingMacros.calories} kcal remaining` : "Start logging meals",
        type: "calories",
        color: "amber",
      },
      {
        id: 3,
        title: "Risk Signals",
        value: String(riskyMeals),
        subtext: riskyMeals > 0 ? "Tap to view details" : "All clear today",
        type: "risk",
        color: riskyMeals > 0 ? "rose" : "emerald",
        isRisky: riskyMeals > 0,
      },
    ];

    console.log(`[${requestId}] Summary calculated: ${mealCount} meals, ${consumedMacros.calories} kcal consumed`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          meals: safeMeals,
          consumedMacros,
          remainingMacros,
          dailyTargets,
          impactCards,
          mealCount,
          goodMeals,
          riskyMeals,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error(`[${requestId}] Error in get-daily-summary function:`, error);
    return new Response(
      JSON.stringify({ error: 'Failed to get daily summary. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
