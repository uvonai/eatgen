import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * WEEKLY LIFE SCORE ADJUSTMENT
 * 
 * Adjusts Life Score based on user's food choices over the past week:
 * - Score < 73: Can change every week by ±2
 * - Score 73: Can change every 1 week by ±1 or ±2
 * - Score ≥ 74: Can change every 2 weeks by ±1 or ±2
 * 
 * Change direction based on food choices:
 * - Majority good choices = increase
 * - Majority bad/risky choices = decrease
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] adjust-weekly-score: Request received`);

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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.warn(`[${requestId}] Invalid or expired token`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    console.log(`[${requestId}] Authenticated user: ${userId.substring(0, 8)}...`);

    // Service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========== GET CURRENT HEALTH ANALYSIS ==========
    const { data: healthAnalysis, error: healthError } = await supabase
      .from('health_analysis')
      .select('health_score, last_calculated_at, updated_at')
      .eq('user_id', userId)
      .single();

    if (healthError || !healthAnalysis) {
      console.log(`[${requestId}] No health analysis found for user`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          adjusted: false, 
          reason: 'No health analysis found',
          currentScore: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentScore = healthAnalysis.health_score || 0;
    const lastUpdated = new Date(healthAnalysis.updated_at || healthAnalysis.last_calculated_at);
    const now = new Date();

    // ========== DETERMINE ADJUSTMENT INTERVAL ==========
    // Score < 73: adjust every 2 days (fast feedback so users see impact quickly)
    // Score 73: adjust every 2 days
    // Score >= 74: adjust every 4 days (slower at higher levels)
    let adjustmentIntervalDays = 2;
    if (currentScore >= 74) {
      adjustmentIntervalDays = 4;
    }

    const daysSinceLastUpdate = Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`[${requestId}] Current score: ${currentScore}, Days since update: ${daysSinceLastUpdate}, Interval needed: ${adjustmentIntervalDays}`);

    if (daysSinceLastUpdate < adjustmentIntervalDays) {
      console.log(`[${requestId}] Not enough time passed for adjustment`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          adjusted: false, 
          reason: `Need ${adjustmentIntervalDays - daysSinceLastUpdate} more days for next adjustment`,
          currentScore,
          daysUntilNextAdjustment: adjustmentIntervalDays - daysSinceLastUpdate
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== GET FOOD SCANS FROM THE PAST PERIOD ==========
    const lookbackDays = Math.max(adjustmentIntervalDays, 2);
    const lookbackDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    
    const { data: foodScans, error: scansError } = await supabase
      .from('food_scans')
      .select('health_impact, scanned_at')
      .eq('user_id', userId)
      .gte('scanned_at', lookbackDate.toISOString())
      .order('scanned_at', { ascending: false });

    if (scansError) {
      console.error(`[${requestId}] Error fetching food scans:`, scansError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch food scans' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scans = foodScans || [];
    const totalScans = scans.length;

    console.log(`[${requestId}] Found ${totalScans} food scans in the past ${lookbackDays} days`);

    // If no scans in the period, no adjustment
    if (totalScans === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          adjusted: false, 
          reason: `No food scans in the past ${lookbackDays} days`,
          currentScore 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== CALCULATE FOOD CHOICE RATIO ==========
    const goodScans = scans.filter(s => s.health_impact === 'good').length;
    const riskyScans = scans.filter(s => s.health_impact === 'risky').length;
    const neutralScans = totalScans - goodScans - riskyScans;

    // Calculate weighted score: good = +1, neutral = 0, risky = -1
    const weightedScore = goodScans - riskyScans;
    const scoreRatio = weightedScore / totalScans; // Range: -1 to +1

    console.log(`[${requestId}] Food analysis: good=${goodScans}, risky=${riskyScans}, neutral=${neutralScans}, ratio=${scoreRatio.toFixed(2)}`);

    // ========== DETERMINE ADJUSTMENT AMOUNT ==========
    // For scores < 73: ±2 points
    // For scores >= 73: ±1 or ±2 points based on intensity
    let adjustment = 0;
    const maxAdjustment = currentScore < 73 ? 2 : 2; // Max ±2 for all levels

    if (Math.abs(scoreRatio) >= 0.5) {
      // Strong majority (>= 50% net difference)
      adjustment = scoreRatio > 0 ? maxAdjustment : -maxAdjustment;
    } else if (Math.abs(scoreRatio) >= 0.2) {
      // Moderate majority (>= 20% net difference)
      adjustment = scoreRatio > 0 ? 1 : -1;
    } else {
      // Mixed choices - smaller adjustment
      if (scoreRatio > 0.05) {
        adjustment = 1;
      } else if (scoreRatio < -0.05) {
        adjustment = -1;
      }
      // If ratio is between -0.05 and 0.05, no adjustment (too balanced)
    }

    // At higher scores (>=74), require stronger consistency for +2
    if (currentScore >= 74 && adjustment === 2 && scoreRatio < 0.6) {
      adjustment = 1; // Harder to gain at higher levels
    }

    // ========== APPLY LIMITS ==========
    // Minimum display score is 65 (as per existing logic)
    // Maximum score is 100
    let newScore = currentScore + adjustment;
    
    // Keep raw score but ensure it doesn't go below the base
    // The base score from questionnaire is the floor
    const minScore = 60; // Absolute minimum (matches initial 60-70 range)
    const maxScore = 100;
    
    newScore = Math.max(minScore, Math.min(maxScore, newScore));

    console.log(`[${requestId}] Adjustment: ${adjustment > 0 ? '+' : ''}${adjustment}, New score: ${newScore}`);

    // ========== UPDATE DATABASE ==========
    if (adjustment !== 0) {
      const { error: updateError } = await supabase
        .from('health_analysis')
        .update({
          health_score: newScore,
          updated_at: now.toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error(`[${requestId}] Error updating health score:`, updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update health score' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[${requestId}] Score updated successfully: ${currentScore} -> ${newScore}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        adjusted: adjustment !== 0,
        previousScore: currentScore,
        newScore: adjustment !== 0 ? newScore : currentScore,
        adjustment,
        reason: adjustment !== 0 
          ? `Score ${adjustment > 0 ? 'increased' : 'decreased'} based on weekly food choices`
          : 'Food choices were balanced, no adjustment',
        stats: {
          totalScans,
          goodScans,
          riskyScans,
          neutralScans,
          scoreRatio: Math.round(scoreRatio * 100) / 100,
        },
        nextAdjustmentIn: adjustmentIntervalDays,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error(`[${requestId}] Error in adjust-weekly-score function:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
