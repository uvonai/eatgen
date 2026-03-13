import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DESCRIBE FOOD EDGE FUNCTION
 * - JWT authentication verification
 * - Text-based food analysis using OpenAI
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] describe-food: Request received`);

  try {
    // ========== JWT AUTHENTICATION ==========
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[${requestId}] Missing or invalid authorization header`);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client for auth verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(`[${requestId}] Supabase credentials not configured`);
      return new Response(
        JSON.stringify({ success: false, error: 'Service configuration error' }),
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
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authenticatedUserId = claimsData.claims.sub as string;
    console.log(`[${requestId}] Authenticated user: ${authenticatedUserId.substring(0, 8)}...`);

    // ========== PARSE REQUEST BODY ==========
    const { foodDescription, servingSize } = await req.json();

    if (!foodDescription || typeof foodDescription !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: "Food description is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate input length
    if (foodDescription.length > 1000) {
      return new Response(
        JSON.stringify({ success: false, error: "Food description too long. Maximum 1000 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error(`[${requestId}] OPENAI_API_KEY not configured`);
      return new Response(
        JSON.stringify({ success: false, error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedServingSize = typeof servingSize === 'string' 
      ? servingSize.substring(0, 100) 
      : '1 serving';

    const systemPrompt = `You are an expert nutritionist who writes like a fearless investigative journalist. Your job: make people FEEL the truth about their food, then back it with science.

NARRATIVE STRATEGY — "Lead with the WOW, back it with the science":
- Every fact should hit emotionally FIRST, then provide the scientific proof
- Write for a teenager or someone with low education — they should understand AND feel shocked
- The science stays as credibility. The wow is what people read first.

CRITICAL RULES:

1. ADDITIVES: List SPECIFIC chemical names with emotional hooks + scientific backing.
   FORMAT: "Chemical Name — [Wow-factor emotional hook] — [scientific source]"
   EXAMPLES:
   - "Sodium Benzoate — Can secretly turn into benzene (a known cancer chemical) when mixed with vitamin C in your drink — confirmed by FDA testing"
   - "Caramel Color 4-MEI — A secret coloring agent in your food — flagged as possibly cancer-causing by WHO"
   - "Titanium Dioxide — The same whitening chemical used in paint and sunscreen is hiding in your food — banned in the EU since 2022"
   For whole/unprocessed foods: return EMPTY array []
   Natural sugars in fruits are NOT "Added Sugars". An apple has ZERO additives.

2. WHAT THEY DON'T TELL YOU: The section that makes people put down their fork and THINK.
   Write like you're exposing a secret the food industry doesn't want you to know.
   FORMAT: Start with a hook that creates a visceral reaction, then drop the fact.
   EXAMPLES:
   - "That shiny apple? It's coated in shellac — the same stuff used to varnish furniture. It's made from lac bug secretions and never appears on any label."
   - "Your 'fresh' chicken was likely injected with salt water to boost weight — you're paying meat prices for water"
   - "'Natural Flavors' is a legal loophole — it can hide up to 100 undisclosed chemicals, and companies never have to tell you what's inside"
   - "Most packaged bread contains L-cysteine — an amino acid often sourced from human hair or duck feathers. Perfectly legal, never labeled."
   Provide 2-3 items for EVERY food. This should NEVER be empty — even healthy foods have hidden facts about farming, storage, or processing.

3. DISEASE RISKS: ONLY actual NEGATIVE health risks. For healthy foods: EMPTY array []

4. ALTERNATIVES: Only if neutral or risky. EXACTLY 3 with specific health advantages.
   - Include a percentage or measurable benefit (e.g., "60% less sodium", "3x more fiber")
   - 3rd option should be surprising/creative
   - For healthy whole foods: EMPTY array []

5. SUMMARY/final_verdict: Write like an expert nutritionist speaking to a friend — direct, specific, mentioning actual nutrients/compounds. Not generic.

6. LIFESPAN: Deterministic. Same food = same number always.

Return a JSON object with this exact structure:
{
  "food_name": "Name of the food",
  "serving_size": "${sanitizedServingSize}",
  "health_score": number 1-100 (higher = healthier),
  "health_impact": "good" | "neutral" | "risky",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "sugar_g": number,
  "sodium_mg": number,
  "lifespan_impact_hours": number (deterministic. Whole fruits: +2 to +7 hours. Junk food: -2 to -12 hours),
  "additives": ["Chemical Name — [Wow hook] — [scientific backing]. EMPTY [] for whole unprocessed foods"],
  "what_they_dont_tell_you": ["2-3 genuinely shocking, wow-first hidden facts - NEVER empty"],
  "disease_risks": ["ONLY actual negative health risks - EMPTY [] for healthy foods"],
  "alternatives": ["Only if food is neutral/risky - EMPTY [] for healthy whole foods"],
  "summary": {
    "daily_benefits": ["specific health benefits with mechanisms - be expert-level"],
    "daily_risks": ["specific health risks - EMPTY [] for healthy foods"],
    "final_verdict": "Expert-level statement. 2 sentences. Mention specific nutrients or compounds."
  }
}`;

    console.log(`[${requestId}] Starting food analysis for authenticated user`);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log(`[${requestId}] Request timeout - aborting`);
      controller.abort();
    }, 50000);

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Analyze this food: "${foodDescription}". Serving size: ${sanitizedServingSize}. Return only the JSON object, no other text.`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[${requestId}] Fetch error:`, fetchError);
      const errorMessage = fetchError instanceof Error && fetchError.name === "AbortError"
        ? "Request timed out. Please try again."
        : "Failed to connect to AI service";
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    clearTimeout(timeoutId);
    console.log(`[${requestId}] AI response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[${requestId}] AI API error: ${response.status}`);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Too many requests. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI service limit reached. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: "Failed to analyze food" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ success: false, error: "No analysis returned" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse & normalize JSON from the AI response
    let analysis: Record<string, unknown>;
    try {
      let cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      const firstBrace = cleanContent.indexOf("{");
      const lastBrace = cleanContent.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanContent = cleanContent.slice(firstBrace, lastBrace + 1);
      }

      analysis = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse AI response`);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to parse analysis" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize to match frontend expectations
    const a: any = analysis;
    const normalized = {
      food_name: String(a.food_name ?? a.foodName ?? "Unknown food"),
      calories: Number(a.calories ?? 0) || 0,
      protein_g: Number(a.protein_g ?? a.protein ?? 0) || 0,
      carbs_g: Number(a.carbs_g ?? a.carbs ?? 0) || 0,
      fat_g: Number(a.fat_g ?? a.fat ?? 0) || 0,
      fiber_g: Number(a.fiber_g ?? a.fiber ?? 0) || 0,
      health_impact: (a.health_impact === "good" || a.health_impact === "neutral" || a.health_impact === "risky") ? a.health_impact : "neutral",
      sugar_g: (a.sugar_g !== undefined ? (Number(a.sugar_g) || 0) : undefined),
      sodium_mg: (a.sodium_mg !== undefined ? (Number(a.sodium_mg) || 0) : undefined),
      portion: String(a.serving_size ?? sanitizedServingSize),
      risk_score: (a.health_score !== undefined ? Math.max(0, Math.min(100, 100 - (Number(a.health_score) || 0))) : undefined),
      lifespan_impact_days: (a.lifespan_impact_hours !== undefined ? (Number(a.lifespan_impact_hours) || 0) / 24 : undefined),
      disease_risks: Array.isArray(a.disease_risks) ? a.disease_risks : [],
      hidden_ingredients: Array.isArray(a.additives) ? a.additives : undefined,
      what_they_dont_tell_you: Array.isArray(a.what_they_dont_tell_you) ? a.what_they_dont_tell_you : undefined,
      safer_alternatives: Array.isArray(a.safer_alternatives)
        ? a.safer_alternatives
        : (Array.isArray(a.alternatives) ? a.alternatives : undefined),
      daily_benefits: Array.isArray(a.daily_benefits)
        ? a.daily_benefits
        : (Array.isArray(a.summary?.daily_benefits) ? a.summary.daily_benefits : undefined),
      daily_risks: Array.isArray(a.daily_risks)
        ? a.daily_risks
        : (Array.isArray(a.summary?.daily_risks) ? a.summary.daily_risks : undefined),
      final_verdict: typeof a.final_verdict === "string"
        ? a.final_verdict
        : (typeof a.summary?.final_verdict === "string" ? a.summary.final_verdict : undefined),
      summary: typeof a.summary === "string"
        ? a.summary
        : (typeof a.summary?.final_verdict === "string" ? a.summary.final_verdict : undefined),
      recommendations: Array.isArray(a.recommendations)
        ? a.recommendations
        : (Array.isArray(a.alternatives) ? a.alternatives : undefined),
    };

    console.log(`[${requestId}] Analysis complete for authenticated user`);

    return new Response(
      JSON.stringify({ success: true, analysis: normalized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[${requestId}] describe-food error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
