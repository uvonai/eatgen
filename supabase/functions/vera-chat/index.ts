import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VERA_SYSTEM_PROMPT = `You are Vera, a comprehensive personal health intelligence and companion inside EatGen. You have complete access to the user's food scan history, health questionnaire, body metrics, and health score. You are their always-available health partner — not just a food reviewer.

YOUR CAPABILITIES:
- Analyze any food, ingredient, or label and explain its impact on THIS specific user's body
- Generate personalized weekly meal plans based on their goals, allergies, diet type, and nutritional gaps
- Track their progress and identify trends (improving protein intake, declining fiber, etc.)
- Set and monitor health goals (weight targets, macro goals, specific nutrient targets)
- Recommend ingredient swaps, supplements, and habit changes tailored to their profile
- Answer ANY question about their body, nutrition, longevity, or wellness
- Explain how their specific health conditions, medications, or lifestyle affect their nutritional needs

GREETING BEHAVIOR:
When a user sends a casual greeting like "Hi", "Hello", "Hey", "What's up", or any casual opener — do NOT analyze their food data or health profile. Instead, respond with ONE warm, short personal question to understand what they need. Examples:
- "Hey! What's on your mind today — your food, your health goals, or something specific you ate?"
- "Hi! Are you looking to improve something specific, or want me to review what you've been eating lately?"
- "Hey there. What would you like to know today?"
Only analyze food history when the user specifically asks about their food, health patterns, weekly review, or a specific nutrition question. For all other casual conversation — be human first. Ask before analyzing.

CRITICAL RULES:
1. For greetings: respond warmly with a question (see GREETING BEHAVIOR above). For all other messages: open IMMEDIATELY with the most important insight or answer. No preamble.
2. Keep responses concise — 2-6 sentences max depending on the question complexity. Meal plans and detailed breakdowns can be longer but stay structured.
3. Reference ACTUAL foods they scanned by name — "that Pepsi on Tuesday", "the grilled chicken on Thursday". Never be vague or generic.
4. ALWAYS tie your answer back to THIS user's specific data — their weight, goals, conditions, allergies, scan history. Generic advice is unacceptable.
5. If a food has harmful additives, name the additive and its risk for THIS user specifically.
6. Never give medical diagnoses. Frame everything as food science and longevity research.
7. Sound like a brilliant scientist friend who genuinely cares — not a chatbot, not customer service.
8. When the user sends a PHOTO of food or a label, analyze it thoroughly. Identify the food, estimate nutrition, note concerns, and relate it to their diet pattern.
9. For meal plans: structure them clearly with meals, portions, and macros. Consider their allergies, diet type, and health goals.
10. For goal tracking: reference their current metrics vs where they should be, and give specific next steps.
11. IMPORTANT: At the very end of EVERY response, add a line break then exactly 3 suggested follow-up questions formatted as:
[SUGGESTIONS]
Question 1?
Question 2?
Question 3?
The suggestions should guide users toward meal planning, goal setting, deeper analysis, or actionable next steps.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, mode, imageBase64 } = await req.json();

    const supabaseService = createClient(supabaseUrl, serviceRoleKey);

    // Fetch last 7 days of food scans
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: foodScans } = await supabaseService
      .from("food_scans")
      .select("food_name, calories, protein_g, carbs_g, fat_g, fiber_g, health_impact, ai_analysis, scanned_at")
      .eq("user_id", user.id)
      .gte("scanned_at", sevenDaysAgo.toISOString())
      .order("scanned_at", { ascending: false })
      .limit(100);

    // Fetch onboarding/questionnaire data
    const { data: onboarding } = await supabaseService
      .from("onboarding_data")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fetch health analysis
    const { data: healthAnalysis } = await supabaseService
      .from("health_analysis")
      .select("health_score, health_summary, recommendations")
      .eq("user_id", user.id)
      .maybeSingle();

    // Build context for Vera
    const scanSummary = (foodScans || []).map((s: any) => {
      const analysis = s.ai_analysis || {};
      return `- ${s.food_name || "Unknown"} (${new Date(s.scanned_at).toLocaleDateString()}): ${s.calories || 0} cal, impact: ${s.health_impact || "unknown"}, protein: ${s.protein_g || 0}g, carbs: ${s.carbs_g || 0}g, fat: ${s.fat_g || 0}g${analysis.additives ? `, additives: ${JSON.stringify(analysis.additives).slice(0, 200)}` : ""}${analysis.lifespan_impact ? `, lifespan: ${analysis.lifespan_impact}` : ""}`;
    }).join("\n");

    const profileContext = onboarding
      ? `User profile: Age from birth_date ${onboarding.birth_date || "unknown"}, gender: ${onboarding.gender || "unknown"}, height: ${onboarding.height_cm || "?"}cm, weight: ${onboarding.weight_kg || "?"}kg, activity: ${onboarding.activity_level || "unknown"}, diet: ${onboarding.diet_type || "unknown"}, sleep: ${onboarding.sleep_hours || "?"}hrs, stress: ${onboarding.stress_level || "unknown"}, health focus: ${(onboarding.health_focus || []).join(", ") || "none"}, conditions: ${(onboarding.health_conditions || []).join(", ") || "none"}, allergies: ${(onboarding.allergies || []).join(", ") || "none"}.`
      : "No questionnaire data available.";

    const healthContext = healthAnalysis
      ? `Current health score: ${healthAnalysis.health_score || 0}/100. Summary: ${healthAnalysis.health_summary || "N/A"}.`
      : "";

    const dataContext = `\n\n--- USER DATA (last 7 days) ---\n${profileContext}\n${healthContext}\nFood scan history (${(foodScans || []).length} items):\n${scanSummary || "No food scans in the last 7 days."}\n--- END DATA ---`;

    const fullSystemPrompt = VERA_SYSTEM_PROMPT + dataContext;

    // Call OpenAI
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build messages - support multimodal (image + text) via content array
    const aiMessages: any[] = [
      { role: "system", content: fullSystemPrompt },
    ];

    // Add conversation history
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        aiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // If init mode and no user messages, add a trigger
    if (mode === "init" && (!messages || messages.length === 0)) {
      aiMessages.push({
        role: "user",
        content: "Analyze my recent food history and health profile. Give me your most important personalized insight — what should I focus on right now based on my specific body, goals, and what I've been eating?",
      });
    }

    // If image is attached, replace last user message with multimodal content
    if (imageBase64 && aiMessages.length > 1) {
      const lastMsg = aiMessages[aiMessages.length - 1];
      if (lastMsg.role === "user") {
        const textContent = typeof lastMsg.content === "string" ? lastMsg.content : "Analyze this food";
        aiMessages[aiMessages.length - 1] = {
          role: "user",
          content: [
            { type: "text", text: textContent },
            { type: "image_url", image_url: { url: imageBase64 } },
          ],
        };
      }
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: aiMessages,
        stream: true,
        max_tokens: 600,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("OpenAI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("vera-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
