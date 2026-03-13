
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, mode } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If signup mode, check if user already exists
    if (mode === "signup") {
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (existingUser) {
        return new Response(JSON.stringify({ error: "account_exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Invalidate previous codes for this email
    await supabaseAdmin
      .from("otp_codes")
      .update({ used: true })
      .eq("email", email.toLowerCase())
      .eq("used", false);

    // Store new code
    const { error: insertError } = await supabaseAdmin.from("otp_codes").insert({
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      return new Response(JSON.stringify({ error: "Failed to generate code" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "EatGen AI <noreply@uvonai.com>",
        to: [email],
        subject: "Your EatGen verification code",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:400px;">
        <tr><td style="text-align:center;padding-bottom:40px;">
          <img src="https://payenwkvrpoeurvovkli.supabase.co/storage/v1/object/public/app-assets/email/eatgen-logo.jpg" alt="EatGen AI" width="48" height="48" style="border-radius:12px;" />
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:4px;">
          <p style="margin:0;font-size:15px;color:#71717a;font-weight:400;">Your verification code</p>
        </td></tr>
        <tr><td style="text-align:center;padding:20px 0 28px;">
          <div style="display:inline-block;background-color:#171717;border-radius:16px;padding:18px 36px;letter-spacing:10px;font-size:28px;font-weight:700;color:#fafafa;">${code}</div>
        </td></tr>
        <tr><td style="text-align:center;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">Expires in 10 minutes.<br/>If you didn't request this, ignore this email.</p>
        </td></tr>
        <tr><td style="text-align:center;padding-top:40px;border-top:1px solid #f4f4f5;margin-top:32px;">
          <p style="margin:24px 0 0;font-size:12px;color:#d4d4d8;">EatGen AI</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error("Resend error:", errBody);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-otp error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
