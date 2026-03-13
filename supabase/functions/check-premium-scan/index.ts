import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * CHECK PREMIUM SCAN - Fair-use rate limiting for premium users
 * 
 * Premium users get 30 scans per calendar day (in their timezone).
 * This is server-side tracking to prevent abuse.
 * 
 * POST body:
 * - action: "check" | "consume"
 * - timezoneOffset: number (minutes from UTC, e.g., -330 for IST)
 * 
 * Response for "check":
 * - canScan: boolean
 * - scanCount: number (current count for today)
 * 
 * Response for "consume":
 * - success: boolean
 * - scanCount: number (new count after increment)
 * - limitReached: boolean
 */

const DAILY_LIMIT = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] check-premium-scan: Request received`);

  try {
    // ========== JWT AUTHENTICATION ==========
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

    // Validate JWT using getClaims (fast path)
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

    const userId = claimsData.claims.sub as string;

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

    const { action, timezoneOffset } = body as {
      action?: "check" | "consume";
      timezoneOffset?: number;
    };

    if (!action || !['check', 'consume'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Action must be "check" or "consume"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate today's date in user's local timezone
    // JavaScript's getTimezoneOffset() returns: UTC - local time (in minutes)
    // Example: IST (UTC+5:30) returns -330, EST (UTC-5) returns 300
    // To get local time from UTC: localTime = UTC - offset
    const offsetMinutes = typeof timezoneOffset === 'number' ? timezoneOffset : 0;
    const now = new Date();
    // Subtract offset because getTimezoneOffset returns inverted value
    const userLocalTime = new Date(now.getTime() - (offsetMinutes * 60 * 1000));
    
    // Extract date components from the adjusted timestamp (NOT using toISOString which returns UTC)
    const year = userLocalTime.getUTCFullYear();
    const month = String(userLocalTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(userLocalTime.getUTCDate()).padStart(2, '0');
    const scanDate = `${year}-${month}-${day}`; // YYYY-MM-DD in user's local day
    
    console.log(`[${requestId}] Timezone: offset=${offsetMinutes}min, UTC=${now.toISOString()}, localTime=${userLocalTime.toISOString()}, scanDate=${scanDate}`);

    // Service-role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'check') {
      // Check current scan count for today
      const { data, error } = await supabase
        .from('premium_daily_scans')
        .select('scan_count')
        .eq('user_id', userId)
        .eq('scan_date', scanDate)
        .maybeSingle();

      if (error) {
        console.error(`[${requestId}] Check error:`, error);
        // On error, allow scan (fail open for UX)
        return new Response(
          JSON.stringify({ canScan: true, scanCount: 0, error: 'Check failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const scanCount = data?.scan_count || 0;
      const canScan = scanCount < DAILY_LIMIT;

      console.log(`[${requestId}] User ${userId.substring(0, 8)}... date=${scanDate} count=${scanCount} canScan=${canScan}`);

      return new Response(
        JSON.stringify({ canScan, scanCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'consume') {
      // First check current count
      const { data: existing, error: checkError } = await supabase
        .from('premium_daily_scans')
        .select('scan_count')
        .eq('user_id', userId)
        .eq('scan_date', scanDate)
        .maybeSingle();

      if (checkError) {
        console.error(`[${requestId}] Pre-consume check error:`, checkError);
      }

      const currentCount = existing?.scan_count || 0;

      // If already at or over limit, reject
      if (currentCount >= DAILY_LIMIT) {
        console.log(`[${requestId}] User ${userId.substring(0, 8)}... LIMIT REACHED (${currentCount})`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            scanCount: currentCount, 
            limitReached: true 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Upsert to increment count
      const newCount = currentCount + 1;
      const { error: upsertError } = await supabase
        .from('premium_daily_scans')
        .upsert({
          user_id: userId,
          scan_date: scanDate,
          scan_count: newCount,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,scan_date' });

      if (upsertError) {
        console.error(`[${requestId}] Consume error:`, upsertError);
        // On error, allow scan (fail open for UX)
        return new Response(
          JSON.stringify({ success: true, scanCount: newCount, error: 'Tracking failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[${requestId}] User ${userId.substring(0, 8)}... consumed scan #${newCount}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          scanCount: newCount,
          limitReached: newCount >= DAILY_LIMIT
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
