import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { isValidEmail, isValidUsername, normalizeEmail, normalizeUsername, generateOTP, logActivity } from "../_shared/validation.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
const RESEND_FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "RENOWNHUB";

// Rate limit constants
const PER_EMAIL_MAX_10MIN = 5;     // 5 emails per 10 minutes per email address
const GLOBAL_MAX_1HOUR = 500;      // 500 emails per hour globally (all emails)

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST is supported.", code: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { email, purpose = "signin", role, username } = body || {};

  // ---- SERVER-SIDE VALIDATION ----
  if (!email) {
    return new Response(JSON.stringify({ error: "Email address is required.", code: "missing_email", field: "email" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "That doesn't look like a valid email address. Please double-check it and try again.", code: "invalid_email", field: "email" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!["signin", "signup"].includes(purpose)) {
    return new Response(JSON.stringify({ error: "Invalid request: purpose must be 'signin' or 'signup'.", code: "invalid_purpose" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const normalizedEmail = normalizeEmail(email);

  if (purpose === "signup") {
    if (!username) {
      return new Response(JSON.stringify({ error: "Username is required to create an account.", code: "missing_username", field: "username" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (!isValidUsername(username)) {
      return new Response(JSON.stringify({ error: "Username must be 3-20 characters using only letters, numbers, underscores, or dots.", code: "invalid_username", field: "username" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  // ---- ENV CHECK ----
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set in edge function env.");
    return new Response(JSON.stringify({ error: "Email service is not configured. Please contact support.", code: "smtp_not_configured" }), {
      status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
    return new Response(JSON.stringify({ error: "Server is not fully configured. Please contact support.", code: "server_misconfigured" }), {
      status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- RATE LIMIT 1: per-email (5 per 10 minutes) ----
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: perEmailCount, error: perEmailErr } = await supabase
    .from("otp_verifications")
    .select("*", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .gte("created_at", tenMinAgo);

  if (perEmailErr) {
    console.error("Per-email rate-limit check failed:", perEmailErr);
  }
  if (perEmailCount && perEmailCount >= PER_EMAIL_MAX_10MIN) {
    return new Response(JSON.stringify({
      error: `You've requested ${perEmailCount} codes in the last 10 minutes. Please wait a few minutes before requesting another. This limit protects against abuse.`,
      code: "rate_limited_per_email",
      retry_after_seconds: 120,
    }), {
      status: 429, headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Retry-After": "120" },
    });
  }

  // ---- RATE LIMIT 2: global (500 per hour across all emails) ----
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: globalCount, error: globalErr } = await supabase
    .from("otp_verifications")
    .select("*", { count: "exact", head: true })
    .gte("created_at", oneHourAgo);

  if (globalErr) {
    console.error("Global rate-limit check failed:", globalErr);
  }
  if (globalCount && globalCount >= GLOBAL_MAX_1HOUR) {
    return new Response(JSON.stringify({
      error: "Our email service is currently at capacity. Please try again in a few minutes.",
      code: "rate_limited_global",
      retry_after_seconds: 600,
    }), {
      status: 429, headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Retry-After": "600" },
    });
  }

  // ---- SIGNUP: check email not already registered ----
  if (purpose === "signup") {
    const { data: existingUser } = await supabase
      .from("users")
      .select("user_id, username")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return new Response(JSON.stringify({
        error: "This email is already registered. Please sign in instead, or use a different email to create a new account.",
        code: "email_already_registered",
      }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Re-verify username availability at send time (defense in depth — final check happens at verify-otp)
    const normalizedUsername = normalizeUsername(username);
    const { data: reserved } = await supabase
      .from("reserved_usernames")
      .select("username")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (reserved) {
      return new Response(JSON.stringify({ error: "This username is reserved. Please choose another.", code: "username_reserved", field: "username" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const { data: takenUser } = await supabase
      .from("users")
      .select("user_id")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (takenUser) {
      return new Response(JSON.stringify({ error: "This username is already taken. Please choose another.", code: "username_taken", field: "username" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const { data: takenCreator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (takenCreator) {
      return new Response(JSON.stringify({ error: "This username is already taken. Please choose another.", code: "username_taken", field: "username" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  // ---- SIGNIN: ensure account exists ----
  if (purpose === "signin") {
    const { data: existingUser } = await supabase
      .from("users")
      .select("user_id, role")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (!existingUser) {
      return new Response(JSON.stringify({
        error: "No account exists with this email. Please sign up first, or check for typos.",
        code: "account_not_found",
      }), {
        status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  // ---- GENERATE OTP ----
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  // Invalidate previous unverified OTPs for this email (mark verified=true so they can't be reused)
  await supabase
    .from("otp_verifications")
    .update({ verified: true })
    .eq("email", normalizedEmail)
    .eq("verified", false);

  // Insert new OTP
  const { error: insertError } = await supabase.from("otp_verifications").insert({
    email: normalizedEmail,
    otp_code: otp,
    purpose,
    role_hint: role || null,
    username_hint: purpose === "signup" ? normalizeUsername(username) : null,
    verified: false,
    expires_at: expiresAt,
    max_attempts: 5,
  });

  if (insertError) {
    console.error("OTP insert error:", insertError);
    return new Response(JSON.stringify({ error: "We couldn't generate a verification code right now. Please try again in a moment.", code: "otp_insert_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- SEND EMAIL VIA RESEND ----
  const fromHeader = `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;
  const emailSubject = purpose === "signup"
    ? `${RESEND_FROM_NAME} — Verify your email (code: ${otp})`
    : `${RESEND_FROM_NAME} — Your sign-in code: ${otp}`;

  const emailHtml = `
<div style="font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;background:#15111F;border-radius:16px;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#F7F3ED;font-size:24px;margin:0;letter-spacing:1px;">${RESEND_FROM_NAME}</h1>
    <p style="color:#9C93AE;font-size:13px;margin-top:6px;">Creator Platform</p>
  </div>
  <div style="background:#1E1830;border-radius:12px;padding:32px;text-align:center;">
    <p style="color:#F7F3ED;font-size:15px;margin-bottom:24px;">
      ${purpose === "signup" ? "Welcome! Use this code to verify your email and finish setting up your account:" : "Use this code to sign in to your account:"}
    </p>
    <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#F0B429;font-family:'Space Mono',monospace;padding:8px 0;">
      ${otp}
    </div>
    <p style="color:#9C93AE;font-size:12px;margin-top:24px;">
      This code expires in 10 minutes. Never share it with anyone — we will never ask for it.
    </p>
  </div>
  <p style="color:#9C93AE;font-size:11px;text-align:center;margin-top:24px;">
    If you didn't request this code, you can safely ignore this email. Someone may have entered your email by mistake.
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
      from: fromHeader,
      to: normalizedEmail,
      subject: emailSubject,
      html: emailHtml,
      tags: [{ name: "purpose", value: purpose }],
    }),
  });

  if (!resendRes.ok) {
    const errBody = await resendRes.text();
    console.error("Resend API error:", resendRes.status, errBody);
    // Map common Resend errors to user-friendly messages
    let userMessage = "We couldn't send the verification email right now. Please try again in a moment.";
    if (resendRes.status === 422 && errBody.includes("domain")) {
      userMessage = "Email sending is temporarily unavailable (sender domain not yet verified). Please contact support.";
    } else if (resendRes.status === 429) {
      userMessage = "Email service rate limit reached. Please wait a few minutes and try again.";
    }
    return new Response(JSON.stringify({ error: userMessage, code: "resend_failed", resend_status: resendRes.status }), {
      status: 502, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  await logActivity(supabase, {
    action: "otp_sent",
    entity_type: "otp",
    metadata: { email: normalizedEmail, purpose },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: `Verification code sent to ${normalizedEmail}. Check your inbox (and spam folder) within the next minute.`,
    expires_in_seconds: 600,
  }), {
    status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
