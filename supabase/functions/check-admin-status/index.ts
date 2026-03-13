import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      // No auth header - return non-admin status gracefully
      return new Response(
        JSON.stringify({ isAdmin: false, userId: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user from token - need getUser here since we need the email for admin check
    const token = authHeader.replace("Bearer ", "");
    
    // First try getClaims for fast validation
    const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsResult?.claims) {
      console.warn("Token validation failed (possibly expired session):", claimsError?.message);
      return new Response(
        JSON.stringify({ isAdmin: false, userId: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsResult.claims.sub as string;
    const userEmail = (claimsResult.claims.email as string)?.toLowerCase();
    const adminEmail = Deno.env.get("ADMIN_EMAIL")?.toLowerCase();

    console.log(`Checking admin status for user: ${userId}, email: ${userEmail}`);

    // Check if user is admin
    const isAdmin = userEmail && adminEmail && userEmail === adminEmail;

    if (isAdmin) {
      console.log(`Admin user detected: ${userEmail}`);
      
      // Update user_limits to set is_premium = true for admin
      const { error: upsertError } = await supabase
        .from("user_limits")
        .upsert(
          {
            user_id: userId,
            is_premium: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (upsertError) {
        console.error("Failed to update admin premium status:", upsertError);
      } else {
        console.log(`Set premium status for admin user: ${userId}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        isAdmin,
        userId 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    console.error("Error in check-admin-status:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
