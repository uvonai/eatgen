import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * CHECK DEVICE SCAN - Per-device free scan tracking
 * 
 * This edge function checks if a device has already used its free scan.
 * Device ID is generated on the client and stored in backend for persistence
 * across app reinstalls and account changes.
 * 
 * POST body:
 * - deviceId: unique device identifier
 * - action: "check" | "consume"
 * - platform: "ios" | "android" | "web"
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] check-device-scan: Request received`);

  try {
    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { deviceId, action, platform } = body as {
      deviceId?: string;
      action?: "check" | "consume";
      platform?: string;
    };

    if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Valid deviceId is required (min 10 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!action || !['check', 'consume'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Action must be "check" or "consume"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use service role to access device_free_scans table (no RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Sanitize device ID (remove any dangerous chars)
    const sanitizedDeviceId = deviceId.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 100);

    if (action === 'check') {
      // Check if device has used free scan
      const { data, error } = await supabase
        .from('device_free_scans')
        .select('id, used_at')
        .eq('device_id', sanitizedDeviceId)
        .maybeSingle();

      if (error) {
        console.error(`[${requestId}] Check error:`, error);
        return new Response(
          JSON.stringify({ error: 'Failed to check device status' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const hasUsedFreeScan = !!data;
      console.log(`[${requestId}] Device ${sanitizedDeviceId.substring(0, 8)}... hasUsed: ${hasUsedFreeScan}`);

      return new Response(
        JSON.stringify({ 
          hasUsedFreeScan,
          usedAt: data?.used_at || null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'consume') {
      // Mark device as having used free scan
      const { error } = await supabase
        .from('device_free_scans')
        .upsert({
          device_id: sanitizedDeviceId,
          platform: platform || 'unknown',
          used_at: new Date().toISOString(),
        }, { onConflict: 'device_id' });

      if (error) {
        console.error(`[${requestId}] Consume error:`, error);
        return new Response(
          JSON.stringify({ error: 'Failed to consume free scan' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[${requestId}] Device ${sanitizedDeviceId.substring(0, 8)}... free scan consumed`);

      return new Response(
        JSON.stringify({ success: true, consumed: true }),
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
