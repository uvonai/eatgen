import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * PRODUCTION-READY SAVE FOOD LOG EDGE FUNCTION (OPTIMIZED FOR SPEED)
 * - JWT authentication via getClaims (faster than getUser)
 * - Background task for user limits update
 * - Minimal DB round-trips
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] save-food-log: Request received`);

  try {
    // ========== JWT AUTHENTICATION (fast path) ==========
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use getClaims instead of getUser – avoids an extra DB round-trip
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authenticatedUserId = claimsData.claims.sub as string;

    // ========== PARSE REQUEST BODY ==========
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { analysis, imageUrl } = body as {
      analysis?: Record<string, unknown>;
      imageUrl?: string;
    };

    if (!analysis || typeof analysis !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Analysis data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service-role client for DB writes
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Sanitize (integers, capped)
    const sanitizedAnalysis = {
      food_name: typeof analysis.food_name === 'string' ? analysis.food_name.substring(0, 200) : 'Unknown Food',
      calories: typeof analysis.calories === 'number' && !isNaN(analysis.calories) ? Math.round(Math.max(0, Math.min(10000, analysis.calories))) : 0,
      protein_g: typeof analysis.protein_g === 'number' && !isNaN(analysis.protein_g) ? Math.round(Math.max(0, Math.min(1000, analysis.protein_g))) : 0,
      carbs_g: typeof analysis.carbs_g === 'number' && !isNaN(analysis.carbs_g) ? Math.round(Math.max(0, Math.min(1000, analysis.carbs_g))) : 0,
      fat_g: typeof analysis.fat_g === 'number' && !isNaN(analysis.fat_g) ? Math.round(Math.max(0, Math.min(1000, analysis.fat_g))) : 0,
      fiber_g: typeof analysis.fiber_g === 'number' && !isNaN(analysis.fiber_g) ? Math.round(Math.max(0, Math.min(200, analysis.fiber_g))) : 0,
      health_impact: ['good', 'neutral', 'risky'].includes(analysis.health_impact as string) ? analysis.health_impact : 'neutral',
    };

    // Insert (select only id for speed)
    const { data, error: insertError } = await supabase
      .from('food_scans')
      .insert({
        user_id: authenticatedUserId,
        food_name: sanitizedAnalysis.food_name,
        calories: sanitizedAnalysis.calories,
        protein_g: sanitizedAnalysis.protein_g,
        carbs_g: sanitizedAnalysis.carbs_g,
        fat_g: sanitizedAnalysis.fat_g,
        fiber_g: sanitizedAnalysis.fiber_g,
        health_impact: sanitizedAnalysis.health_impact,
        ai_analysis: analysis,
        image_url: typeof imageUrl === 'string' ? imageUrl.substring(0, 2000) : null,
        scanned_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`[${requestId}] Insert failed:`, insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save food log.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Saved food scan ${data.id}`);

    // Background: update user_limits without blocking response
    // Fire-and-forget pattern (no await, no EdgeRuntime dependency)
    (async () => {
      try {
        const { data: limitsData } = await supabase
          .from('user_limits')
          .select('free_scans_used, is_premium')
          .eq('user_id', authenticatedUserId)
          .maybeSingle();

        if (limitsData && !limitsData.is_premium) {
          await supabase
            .from('user_limits')
            .update({
              free_scans_used: (limitsData.free_scans_used || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', authenticatedUserId);
        }
      } catch (e) {
        console.warn(`[${requestId}] Limits update failed:`, e);
      }
    })();


    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: 'Failed to save food log.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

