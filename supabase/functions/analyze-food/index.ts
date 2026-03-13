import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * PRODUCTION-READY FOOD ANALYSIS EDGE FUNCTION
 * - JWT authentication verification
 * - Uses OpenAI GPT-4o for high-quality food image analysis
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] analyze-food: Request received`);

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

    // Initialize Supabase client for auth verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
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

    console.log(`[${requestId}] Authenticated user: ${(claimsData.claims.sub as string).substring(0, 8)}...`);

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

    const { imageBase64 } = body as { imageBase64?: string };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      console.error(`[${requestId}] Missing or invalid image`);
      return new Response(
        JSON.stringify({ error: 'Image is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (imageBase64.length > 10 * 1024 * 1024) {
      console.error(`[${requestId}] Image too large: ${Math.round(imageBase64.length / 1024 / 1024)}MB`);
      return new Response(
        JSON.stringify({ error: 'Image too large. Please use a smaller image.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use OpenAI API with user's API key
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error(`[${requestId}] OPENAI_API_KEY not configured`);
      return new Response(
        JSON.stringify({ error: 'AI service not configured. Please contact support.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Analyzing food image for authenticated user`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      // Format image URL correctly
      const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
      
      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are an expert nutritionist providing clinical-grade food analysis. Be specific, factual, and intelligent.

CRITICAL RULES:
1. ADDITIVES / hidden_ingredients: List SPECIFIC chemical names found in the food with their health concern.
   - FORMAT: Lead with a short, emotionally shocking phrase, then back it with the science.
   - Pattern: "Chemical Name — [Wow-factor hook] — [scientific backing]"
   - Examples:
     * "Calcium Propionate — A hidden preservative linked to mood swings in kids — flagged in the Journal of Pediatrics"
     * "Sodium Benzoate — Can secretly turn into benzene (a known carcinogen) when mixed with vitamin C in your drink"
     * "Sodium Nitrite — The invisible ingredient making your meat pink — classified as a cancer risk by WHO"
     * "Caramel Color (4-MEI) — A secret coloring agent in your food — flagged as possibly cancer-causing by WHO"
   - Natural sugars in fruits are NOT additives. An apple has ZERO additives.
   - For whole/unprocessed foods: return EMPTY array []
   - NEVER use vague terms like "preservatives" — always name the specific chemical
   - The WOW comes first. The science is the proof underneath. Make it hit emotionally, then validate with facts.

2. WHAT THEY DON'T TELL YOU / what_they_dont_tell_you: This is DIFFERENT from additives. This reveals legally hidden or undisclosed facts that manufacturers don't have to put on labels.
   - These are things consumers would be SHOCKED to learn — written so a teenager or anyone can instantly understand the danger
   - FORMAT: Lead with an emotional hook that creates outrage or disbelief, then state the fact
   - Examples for PROCESSED foods:
     * "Your 'Natural Flavors'? They can legally hide up to 100 secret chemicals — and nobody has to tell you what's inside"
     * "That innocent word 'Spices' on the label? It can legally be hiding MSG — no disclosure required"
     * "The secret sauce recipe is literally a secret — exact chemicals are trade secrets, hidden from you forever"
     * "Preservatives from sub-ingredients can sneak into your food without appearing on the label — completely legal"
     * "Your burger bun may contain L-Cysteine — often made from human hair or duck feathers — and it never has to be on the label"
   - Examples for WHOLE/FRESH foods:
     * "That shiny apple? It's coated in shellac (yes, the same stuff used on furniture) — and it's never listed anywhere"
     * "Conventional apples can carry up to 47 different pesticide residues — not a single one shown on any label"
     * "After harvest, your fruit may be sprayed with fungicides to stop mold — and nobody tells you at the store"
   - EVERY food has hidden facts. Even healthy whole foods have undisclosed information about farming, storage, or processing.
   - Provide 2-3 items for EVERY food. This section should NEVER be empty.
   - Make each fact genuinely surprising, easy to understand, and verifiable
   - Write like you're telling a friend something shocking — not like a textbook

3. DISEASE RISKS: ONLY list actual NEGATIVE health risks from this specific food.
   - For healthy foods (fruits, vegetables, lean proteins): return EMPTY array []
   - NEVER include benefits in disease_risks

4. SAFER ALTERNATIVES: Only provide if the food is neutral or risky. Always provide EXACTLY 3 alternatives.
   - Each alternative MUST include a specific health advantage, e.g. "Grilled chicken sandwich — 40% less saturated fat"
   - Make the 3rd option surprising or creative, not obvious
   - For healthy whole foods: return EMPTY array [] (no alternatives needed)
   - Never return ["N/A"] — use empty array instead

5. SUMMARY: Write like an expert nutritionist, not a child. Be specific about WHY the food is good or bad.
   - BAD: "A whole red apple, known for being nutritious and delicious"
   - GOOD: "Clean whole food with zero processing. Rich in quercetin and pectin fiber that supports gut health. Natural sugars digest slower than processed alternatives due to fiber content."

6. LIFESPAN IMPACT: Use a deterministic formula based on the food's actual nutritional profile.
   - Whole fruits/vegetables: +0.1 to +0.3 days per serving (based on fiber, antioxidants)
   - Lean proteins: +0.05 to +0.15 days
   - Processed/fried foods: -0.1 to -0.5 days (based on sodium, trans fats, sugar)
   - Be CONSISTENT: same food = same number every time

Return ONLY valid JSON (no markdown):
{
  "food_name": "Name of the food",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "sugar_g": number,
  "sodium_mg": number,
  "health_impact": "good" | "neutral" | "risky",
  "summary": "2-3 sentences. Expert-level insight about this specific food's impact on the body. Mention specific nutrients, compounds, or mechanisms.",
  "daily_benefits": ["Specific, factual benefits with mechanisms. Empty [] for unhealthy foods."],
  "daily_risks": ["Specific, factual risks. Empty [] for healthy foods."],
  "final_verdict": "Direct, expert statement. Match health_impact.",
  "recommendations": ["2-3 actionable tips"],
  "cuisine": "Cuisine type",
  "portion": "Portion size",
  "confidence": number (0-100),
  "risk_score": number (0-100, lower = healthier),
  "lifespan_impact_days": number (deterministic, consistent for same food),
  "disease_risks": ["ONLY real disease risks - EMPTY [] for healthy foods"],
  "hidden_ingredients": ["ONLY actual artificial additives/chemicals with research citations - EMPTY [] for whole foods"],
  "what_they_dont_tell_you": ["2-3 genuinely shocking, legally hidden facts about this food - NEVER empty"],
  "safer_alternatives": ["Only if food is neutral/risky - EMPTY [] for healthy foods"]
}

SCORING GUIDE:
- Whole fruits/vegetables/lean proteins: risk_score 5-20, health_impact "good", disease_risks [], hidden_ingredients [], safer_alternatives []
- Balanced home-cooked meals: risk_score 20-40, health_impact "neutral"
- Processed/fried/sugary foods: risk_score 50-80, health_impact "risky"

EXAMPLES:
- Apple: risk_score 10, disease_risks [], hidden_ingredients [], what_they_dont_tell_you ["That shiny apple? It's coated in shellac (yes, the same stuff used on furniture) — and it's never listed anywhere", "Conventional apples can carry up to 47 different pesticide residues — not a single one shown on any label", "After harvest, your fruit may be sprayed with fungicides to stop mold — and nobody tells you at the store"], safer_alternatives [], lifespan_impact_days 0.2
- Cheeseburger: risk_score 35, hidden_ingredients ["Calcium Propionate — A hidden preservative linked to mood swings in kids — flagged in the Journal of Pediatrics", "Sodium Phosphate — Sneaks into processed cheese and quietly stresses your kidneys over time", "Caramel Color (4-MEI) — A secret coloring agent in your bun — flagged as possibly cancer-causing by WHO"], what_they_dont_tell_you ["Your 'Natural Flavors' in the sauce? They can legally hide up to 100 secret chemicals — and nobody has to tell you what's inside", "Your burger bun may contain L-Cysteine — often made from human hair or duck feathers — and it never has to be on the label", "Preservatives from the cheese processing can sneak into your burger without appearing on the final label — completely legal"], safer_alternatives ["Grilled chicken sandwich — 40% less saturated fat", "Vegetable burger — 60% less sodium", "Homemade turkey burger with whole grain bun — retains protein with half the additives"]`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this food image and provide detailed nutritional information. Return ONLY valid JSON.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
        }),
      });

      clearTimeout(timeoutId);

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error(`[${requestId}] OpenAI API error: ${aiResponse.status}`);
        
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Service is busy. Please try again in a moment.' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (aiResponse.status === 401) {
          return new Response(
            JSON.stringify({ error: 'Invalid API key. Please check your OpenAI API key.' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: 'AI analysis temporarily unavailable. Please try again.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiData = await aiResponse.json();
      const analysisText = aiData.choices?.[0]?.message?.content || '';
      
      console.log(`[${requestId}] AI response received, length: ${analysisText.length}`);

      let analysis;
      try {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error(`[${requestId}] Failed to parse AI response`);
        analysis = {
          food_name: 'Unknown Food',
          calories: 200,
          protein_g: 10,
          carbs_g: 25,
          fat_g: 8,
          fiber_g: 3,
          sugar_g: 5,
          sodium_mg: 400,
          health_impact: 'neutral',
          summary: 'Unable to fully analyze the food. Please try again with a clearer image.',
          recommendations: ['Try taking a clearer photo', 'Ensure good lighting'],
          cuisine: 'Unknown',
          portion: '1 serving',
          confidence: 30,
          risk_score: 50,
          lifespan_impact_days: 0,
          disease_risks: [],
          hidden_ingredients: [],
          what_they_dont_tell_you: [],
          safer_alternatives: []
        };
      }

      // Ensure all fields have safe default values
      analysis = {
        food_name: typeof analysis.food_name === 'string' ? analysis.food_name : 'Food Item',
        calories: typeof analysis.calories === 'number' && !isNaN(analysis.calories) ? Math.max(0, analysis.calories) : 200,
        protein_g: typeof analysis.protein_g === 'number' && !isNaN(analysis.protein_g) ? Math.max(0, analysis.protein_g) : 10,
        carbs_g: typeof analysis.carbs_g === 'number' && !isNaN(analysis.carbs_g) ? Math.max(0, analysis.carbs_g) : 25,
        fat_g: typeof analysis.fat_g === 'number' && !isNaN(analysis.fat_g) ? Math.max(0, analysis.fat_g) : 8,
        fiber_g: typeof analysis.fiber_g === 'number' && !isNaN(analysis.fiber_g) ? Math.max(0, analysis.fiber_g) : 3,
        sugar_g: typeof analysis.sugar_g === 'number' && !isNaN(analysis.sugar_g) ? Math.max(0, analysis.sugar_g) : 5,
        sodium_mg: typeof analysis.sodium_mg === 'number' && !isNaN(analysis.sodium_mg) ? Math.max(0, analysis.sodium_mg) : 400,
        health_impact: ['good', 'neutral', 'risky'].includes(analysis.health_impact) ? analysis.health_impact : 'neutral',
        summary: typeof analysis.summary === 'string' ? analysis.summary : 'Food analyzed successfully.',
        recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations.filter((r: unknown) => typeof r === 'string') : [],
        cuisine: typeof analysis.cuisine === 'string' ? analysis.cuisine : 'Mixed',
        portion: typeof analysis.portion === 'string' ? analysis.portion : '1 serving',
        confidence: typeof analysis.confidence === 'number' && !isNaN(analysis.confidence) ? Math.min(100, Math.max(0, analysis.confidence)) : 75,
        risk_score: typeof analysis.risk_score === 'number' && !isNaN(analysis.risk_score) ? Math.min(100, Math.max(0, analysis.risk_score)) : 40,
        lifespan_impact_days: typeof analysis.lifespan_impact_days === 'number' && !isNaN(analysis.lifespan_impact_days) ? analysis.lifespan_impact_days : 0,
        disease_risks: Array.isArray(analysis.disease_risks) ? analysis.disease_risks.filter((r: unknown) => typeof r === 'string') : [],
        hidden_ingredients: Array.isArray(analysis.hidden_ingredients) ? analysis.hidden_ingredients.filter((r: unknown) => typeof r === 'string') : [],
        what_they_dont_tell_you: Array.isArray(analysis.what_they_dont_tell_you) ? analysis.what_they_dont_tell_you.filter((r: unknown) => typeof r === 'string') : [],
        safer_alternatives: Array.isArray(analysis.safer_alternatives) ? analysis.safer_alternatives.filter((r: unknown) => typeof r === 'string') : []
      };

      console.log(`[${requestId}] Analysis complete: ${analysis.food_name} - ${analysis.calories} kcal`);

      return new Response(
        JSON.stringify({ success: true, analysis }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error(`[${requestId}] AI request timed out`);
        return new Response(
          JSON.stringify({ error: 'Analysis took too long. Please try again with a clearer image.' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw fetchError;
    }

  } catch (error: unknown) {
    console.error(`[${requestId}] Error in analyze-food function:`, error);
    return new Response(
      JSON.stringify({ error: 'Analysis failed. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
