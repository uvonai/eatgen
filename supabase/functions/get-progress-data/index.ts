import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * PRODUCTION-READY PROGRESS DATA EDGE FUNCTION
 * - JWT authentication verification
 * - Per-user data isolation (fetches ONLY authenticated user's data)
 * - All calculations and aggregations done on backend
 * - Robust error handling with safe defaults
 * - Frontend only displays pre-calculated results
 */

interface DailyData {
  date: string;
  score: number;
  meals: number;
  calories: number;
  healthyMeals: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] get-progress-data: Request received`);

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

    const { timezoneOffset } = body as { timezoneOffset?: number };

    // Use service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's timezone offset for accurate day calculations
    // Validate timezone offset range (-720 to +840 minutes = UTC-12 to UTC+14)
    const userOffsetMinutes = typeof timezoneOffset === 'number' 
      ? Math.max(-720, Math.min(840, Math.round(timezoneOffset)))
      : 0;

    console.log(`[${requestId}] Fetching progress data for authenticated user`);

    // Fetch ONLY authenticated user's food scans for the past year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const { data: scans, error } = await supabase
      .from('food_scans')
      .select('id, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, health_impact, scanned_at')
      .eq('user_id', authenticatedUserId)  // Use verified auth user ID
      .gte('scanned_at', oneYearAgo.toISOString())
      .order('scanned_at', { ascending: true })
      .limit(5000);

    if (error) {
      console.error(`[${requestId}] Error fetching scans:`, error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch progress data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ALL CALCULATIONS DONE ON BACKEND - Process data into daily aggregates
    const dailyData = new Map<string, DailyData>();
    const safeScans = scans || [];
    
    // Helper function to get local date string based on user's timezone
    const getLocalDateString = (utcDateStr: string): string => {
      const utcDate = new Date(utcDateStr);
      const localTime = new Date(utcDate.getTime() - userOffsetMinutes * 60 * 1000);
      return localTime.toISOString().split('T')[0];
    };
    
    safeScans.forEach((scan) => {
      try {
        const date = getLocalDateString(scan.scanned_at);
        const existing = dailyData.get(date) || {
          date,
          score: 70,
          meals: 0,
          calories: 0,
          healthyMeals: 0,
        };

        existing.meals += 1;
        existing.calories += typeof scan.calories === 'number' ? scan.calories : 0;
        
        if (scan.health_impact === 'good') {
          existing.healthyMeals += 1;
          existing.score += 3;
        } else if (scan.health_impact === 'risky') {
          existing.score -= 2;
        }

        existing.score = Math.min(100, Math.max(0, existing.score));

        dailyData.set(date, existing);
      } catch (e) {
        console.warn(`[${requestId}] Skipping invalid scan entry`);
      }
    });

    // Calculate chart data for different time ranges
    const now = new Date();
    const days7Ago = new Date(now);
    days7Ago.setDate(days7Ago.getDate() - 7);
    const days30Ago = new Date(now);
    days30Ago.setDate(days30Ago.getDate() - 30);
    const months6Ago = new Date(now);
    months6Ago.setMonth(months6Ago.getMonth() - 6);

    const generateChartData = (startDate: Date, points: number): number[] => {
      const data: number[] = [];
      const interval = (now.getTime() - startDate.getTime()) / points;
      
      for (let i = 0; i < points; i++) {
        const pointDate = new Date(startDate.getTime() + interval * i);
        const dateStr = pointDate.toISOString().split('T')[0];
        const dayData = dailyData.get(dateStr);
        
        if (dayData) {
          data.push(Math.min(100, Math.max(0, dayData.score)));
        } else if (data.length > 0) {
          data.push(data[data.length - 1]);
        } else {
          data.push(70);
        }
      }
      
      return data;
    };

    const chartData = {
      '7d': generateChartData(days7Ago, 7),
      '30d': generateChartData(days30Ago, 30),
      '6m': generateChartData(months6Ago, 6),
      '1y': generateChartData(oneYearAgo, 12),
    };

    // Calculate weekly insights
    const last7Days = Array.from(dailyData.values()).filter(
      (d) => new Date(d.date) >= days7Ago
    );
    
    const avgScore = last7Days.length > 0
      ? Math.round(last7Days.reduce((sum, d) => sum + d.score, 0) / last7Days.length)
      : 70;

    const bestDayData = last7Days.reduce(
      (best, day) => (day.score > best.score ? day : best),
      { date: '', score: 0 }
    );

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bestDayName = bestDayData.date 
      ? dayNames[new Date(bestDayData.date).getDay()] 
      : '—';

    const daysWithMeals = last7Days.filter((d) => d.meals > 0).length;
    const consistency = daysWithMeals >= 6 
      ? 'Excellent' 
      : daysWithMeals >= 4 
        ? 'Good' 
        : daysWithMeals >= 2 
          ? 'Moderate' 
          : 'Low';

    // Calculate change from previous week
    const prev7DaysStart = new Date(days7Ago);
    prev7DaysStart.setDate(prev7DaysStart.getDate() - 7);
    const prev7Days = Array.from(dailyData.values()).filter(
      (d) => new Date(d.date) >= prev7DaysStart && new Date(d.date) < days7Ago
    );
    const prevAvg = prev7Days.length > 0
      ? prev7Days.reduce((sum, d) => sum + d.score, 0) / prev7Days.length
      : avgScore;
    const weekChange = Math.round(avgScore - prevAvg);

    const weeklyInsights = {
      average: avgScore,
      bestDay: bestDayName,
      consistency,
      changeFromLastWeek: weekChange,
    };

    // Calculate monthly change
    const last30Days = Array.from(dailyData.values()).filter(
      (d) => new Date(d.date) >= days30Ago
    );
    const totalMeals = last30Days.reduce((sum, d) => sum + d.meals, 0);
    const healthyMeals = last30Days.reduce((sum, d) => sum + d.healthyMeals, 0);
    const healthyPct = totalMeals > 0 ? Math.round((healthyMeals / totalMeals) * 100) : 0;

    const monthlyChange = {
      score: weekChange,
      meals: totalMeals,
      healthyPercentage: healthyPct,
    };

    // Generate highlights based on data
    const highlights: string[] = [];
    if (healthyPct >= 70) {
      highlights.push('Great food choices this month!');
    } else if (healthyPct >= 50) {
      highlights.push('Balanced food choices most days');
    }
    if (daysWithMeals >= 6) {
      highlights.push('Consistent meal tracking this week');
    }
    if (avgScore >= 75) {
      highlights.push('Your Life Score is improving!');
    }
    if (totalMeals >= 21) {
      highlights.push('Logging 3+ meals daily');
    }
    if (highlights.length === 0) {
      highlights.push('Start scanning meals to see your progress');
    }

    console.log(`[${requestId}] Progress data calculated: avgScore=${avgScore}, totalMeals=${totalMeals}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          chartData,
          weeklyInsights,
          monthlyChange,
          highlights: highlights.slice(0, 4),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error(`[${requestId}] Error in get-progress-data function:`, error);
    return new Response(
      JSON.stringify({ error: 'Failed to get progress data. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
