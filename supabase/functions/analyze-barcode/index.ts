import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OffProductResponse = {
  status?: number;
  product?: {
    product_name?: string;
    brands?: string;
    quantity?: string;
    serving_size?: string;
    ingredients_text?: string;
    categories?: string;
    image_url?: string;
    nutriments?: Record<string, unknown>;
  };
};

const toNumber = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ========== JWT AUTHENTICATION ==========
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);

    if (authError || !claimsData?.claims) {
      console.error("Auth error:", authError?.message || "No claims found");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    console.log(`Authenticated user: ${userId.substring(0, 8)}...`);
    // ========== END AUTH ==========

    const { barcode } = await req.json();

    if (!barcode || typeof barcode !== "string") {
      return new Response(JSON.stringify({ error: "Barcode is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analyzing barcode: ${barcode}`);

    // 1) Fetch real product facts (no guessing) from Open Food Facts
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
    const offRes = await fetch(offUrl, {
      headers: {
        "User-Agent": "EatgenAI/1.0 (Lovable Cloud)",
        "Accept": "application/json",
      },
    });

    if (!offRes.ok) {
      console.error("OpenFoodFacts error:", await offRes.text());
      return new Response(JSON.stringify({ error: "Product not found for this barcode" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const offData = (await offRes.json()) as OffProductResponse;
    if (offData?.status !== 1 || !offData.product) {
      return new Response(JSON.stringify({ error: "Product not found for this barcode" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const product = offData.product;
    const nutriments = product.nutriments ?? {};

    // Prefer "per serving" numbers if available; otherwise use per 100g
    const calories =
      toNumber(nutriments["energy-kcal_serving"]) ||
      toNumber(nutriments["energy-kcal_100g"]) ||
      0;

    const protein_g =
      toNumber(nutriments["proteins_serving"]) || toNumber(nutriments["proteins_100g"]) || 0;
    const carbs_g =
      toNumber(nutriments["carbohydrates_serving"]) ||
      toNumber(nutriments["carbohydrates_100g"]) ||
      0;
    const fat_g = toNumber(nutriments["fat_serving"]) || toNumber(nutriments["fat_100g"]) || 0;
    const fiber_g =
      toNumber(nutriments["fiber_serving"]) || toNumber(nutriments["fiber_100g"]) || 0;
    const sugar_g =
      toNumber(nutriments["sugars_serving"]) || toNumber(nutriments["sugars_100g"]) || 0;

    // OFF often provides sodium in g; we want mg
    const sodium_g =
      toNumber(nutriments["sodium_serving"]) || toNumber(nutriments["sodium_100g"]) || 0;
    const sodium_mg = Math.round(sodium_g * 1000);

    const portion =
      product.serving_size ||
      product.quantity ||
      (toNumber(nutriments["energy-kcal_serving"]) ? "1 serving" : "per 100g");

    const food_name = product.product_name || "Unknown Product";

    // 2) Use AI ONLY to interpret + summarize the factual data (no barcode lookup)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are an expert nutritionist who writes like a fearless investigative journalist. Your job: make people FEEL the truth about their food, then back it with science.

NARRATIVE STRATEGY — "Lead with the WOW, back it with the science":
- Every fact should hit emotionally FIRST, then provide the scientific proof
- Write for a teenager or someone with low education — they should understand AND feel shocked
- The science stays as credibility. The wow is what people read first.

Use ONLY the provided product facts below. Do NOT invent nutrition numbers.

CRITICAL RULES:

1. HIDDEN INGREDIENTS (additives): List SPECIFIC chemical names with emotional hooks + scientific backing.
   FORMAT: "Chemical Name — [Wow-factor emotional hook] — [scientific source]"
   EXAMPLES:
   - "Sodium Benzoate — Can secretly turn into benzene (a known cancer chemical) when mixed with vitamin C — confirmed by FDA testing"
   - "Caramel Color 4-MEI — A secret coloring agent in your food — flagged as possibly cancer-causing by WHO"
   Parse the ingredients_text carefully. If no artificial additives exist, return EMPTY array [].

2. WHAT THEY DON'T TELL YOU: The section that makes people put down their fork and THINK.
   FORMAT: Start with a hook that creates a visceral reaction, then drop the fact.
   EXAMPLES:
   - "'Natural Flavors' is a legal loophole — it can hide up to 100 undisclosed chemicals"
   - "Most packaged bread contains L-cysteine — an amino acid often sourced from human hair or duck feathers"
   Provide 2-3 items. NEVER empty — every packaged food has hidden facts.

3. DISEASE RISKS: Only actual negative health risks. EMPTY [] for healthy foods.

4. SAFER ALTERNATIVES: EXACTLY 3 with specific measurable benefits (e.g., "60% less sodium", "3x more fiber").
   3rd option should be surprising/creative. EMPTY [] if food is already healthy.

5. SUMMARY: Write like an expert nutritionist speaking to a friend — direct, specific, mentioning actual nutrients/compounds.

Return ONLY valid JSON (no markdown) with this structure:
{
  "health_impact": "good" | "neutral" | "risky",
  "summary": string,
  "risk_score": number (0-100, higher = riskier),
  "lifespan_impact_days": number (deterministic, negative for unhealthy),
  "disease_risks": string[],
  "hidden_ingredients": ["Chemical — [Wow hook] — [science]. EMPTY [] if none"],
  "what_they_dont_tell_you": ["2-3 wow-first shocking hidden facts - NEVER empty for packaged foods"],
  "safer_alternatives": string[],
  "recommendations": string[]
}

PRODUCT FACTS:
${JSON.stringify({
      food_name,
      portion,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
      sodium_mg,
      ingredients_text: product.ingredients_text || "",
      categories: product.categories || "",
      brands: product.brands || "",
    })}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      console.error("AI API error:", await aiRes.text());
      throw new Error("Failed to analyze barcode");
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let interpretation: Record<string, unknown> = {};
    try {
      let cleanContent = String(content).trim();
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
      }
      interpretation = JSON.parse(cleanContent);
    } catch {
      interpretation = {
        health_impact: "neutral",
        summary: "Scanned via barcode",
        risk_score: 50,
        lifespan_impact_days: 0,
        disease_risks: [],
        hidden_ingredients: [],
        what_they_dont_tell_you: [],
        safer_alternatives: [],
        recommendations: [],
      };
    }

    const health_impact = ["good", "neutral", "risky"].includes(String(interpretation.health_impact))
      ? (interpretation.health_impact as "good" | "neutral" | "risky")
      : "neutral";

    const safeAnalysis = {
      food_name,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
      sodium_mg,
      portion,
      health_impact,
      summary: String(interpretation.summary || "Scanned via barcode"),
      risk_score: toNumber(interpretation.risk_score) || 50,
      lifespan_impact_days: toNumber(interpretation.lifespan_impact_days) || 0,
      disease_risks: Array.isArray(interpretation.disease_risks) ? interpretation.disease_risks : [],
      hidden_ingredients: Array.isArray(interpretation.hidden_ingredients)
        ? interpretation.hidden_ingredients
        : [],
      what_they_dont_tell_you: Array.isArray(interpretation.what_they_dont_tell_you)
        ? interpretation.what_they_dont_tell_you
        : [],
      safer_alternatives: Array.isArray(interpretation.safer_alternatives)
        ? interpretation.safer_alternatives
        : [],
      recommendations: Array.isArray(interpretation.recommendations)
        ? interpretation.recommendations
        : [],
      confidence: 0.9,
      image_url: product.image_url || null,
    };

    console.log(`Barcode ${barcode} identified as: ${safeAnalysis.food_name}`);

    return new Response(JSON.stringify({ success: true, analysis: safeAnalysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Barcode analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to analyze barcode";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
