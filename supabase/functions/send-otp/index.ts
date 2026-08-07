import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

function generateOTP(): string {
  const digits = new Uint32Array(6);
  crypto.getRandomValues(digits);
  return Array.from(digits, (d) => d % 10).join("");
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, purpose = "signin", role, username } = await req.json();

    // ---- SERVER-SIDE VALIDATION: Never trust frontend ----
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["signin", "signup"].includes(purpose)) {
      return new Response(JSON.stringify({ error: "Invalid purpose" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If signup with username, validate server-side too
    if (purpose === "signup" && username) {
      const usernameRegex = /^[a-zA-Z0-9_.]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return new Response(
          JSON.stringify({ error: "Username must be 3-20 chars, alphanumeric/underscore/dot" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit: max 5 OTPs per email in last 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("otp_verifications")
      .select("*", { count: "exact", head: true })
      .eq("email", email.toLowerCase())
      .gte("created_at", tenMinAgo);

    if (countError) {
      console.error("Rate limit check error:", countError);
    }
    if (count && count >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many OTP requests. Please wait 10 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For signup: check if email already registered
    if (purpose === "signup") {
      const { data: existingUser } = await supabase
        .from("users")
        .select("user_id")
        .eq("email", email.toLowerCase())
        .single();

      if (existingUser) {
        return new Response(
          JSON.stringify({ error: "Email already registered. Please sign in." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate 6-digit OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Invalidate previous unverified OTPs for this email
    await supabase
      .from("otp_verifications")
      .update({ verified: true })
      .eq("email", email.toLowerCase())
      .eq("verified", false);

    // Store OTP
    const { error: insertError } = await supabase.from("otp_verifications").insert({
      email: email.toLowerCase(),
      otp_code: otp,
      purpose,
      role_hint: role || null,
      username_hint: username || null,
      verified: false,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("OTP insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send OTP via Resend
    const emailSubject =
      purpose === "signup"
        ? "Welcome to MALLU CUPID - Verify your email"
        : "MALLU CUPID - Your sign-in code";

    const emailHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #15111F; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #F7F3ED; font-size: 28px; margin: 0;">MALLU CUPID</h1>
          <p style="color: #9C93AE; font-size: 14px; margin-top: 8px;">Creator Platform</p>
        </div>
        <div style="background: #1E1830; border-radius: 12px; padding: 32px; text-align: center;">
          <p style="color: #F7F3ED; font-size: 16px; margin-bottom: 24px;">
            ${purpose === "signup" ? "Your verification code is:" : "Your sign-in code is:"}
          </p>
          <div style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #F0B429; font-family: 'Space Mono', monospace;">
            ${otp}
          </div>
          <p style="color: #9C93AE; font-size: 13px; margin-top: 24px;">
            This code expires in 10 minutes. Do not share it with anyone.
          </p>
        </div>
        <p style="color: #9C93AE; font-size: 12px; text-align: center; margin-top: 24px;">
          If you did not request this, you can safely ignore this email.
        </p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MALLU CUPID <noreply@mallucupid.com>",
        to: email.toLowerCase(),
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error("Resend error:", errBody);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent to your email" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-otp error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
