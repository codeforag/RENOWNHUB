import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { isValidEmail, isValidUsername, normalizeEmail, normalizeUsername, logActivity } from "../_shared/validation.ts";

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
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { email, otp, purpose = "signin" } = body || {};

  // ---- SERVER-SIDE VALIDATION ----
  if (!email) {
    return new Response(JSON.stringify({ error: "Email is required.", code: "missing_email", field: "email" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!otp) {
    return new Response(JSON.stringify({ error: "OTP code is required.", code: "missing_otp", field: "otp" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "Invalid email format.", code: "invalid_email", field: "email" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!["signin", "signup"].includes(purpose)) {
    return new Response(JSON.stringify({ error: "Invalid purpose. Must be 'signin' or 'signup'.", code: "invalid_purpose" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    return new Response(JSON.stringify({ error: "OTP must be exactly 6 digits.", code: "invalid_otp_format", field: "otp" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return new Response(JSON.stringify({ error: "Server is not fully configured. Please contact support.", code: "server_misconfigured" }), {
      status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Clean expired OTPs (non-fatal if RPC missing)
  try { await supabase.rpc("clean_expired_otps"); } catch { /* ignore */ }

  // ---- FIND OTP RECORD ----
  const normalizedEmail = normalizeEmail(email);
  const { data: otpRecord, error: otpError } = await supabase
    .from("otp_verifications")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("otp_code", otp)
    .eq("purpose", purpose)
    .eq("verified", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpError) {
    console.error("OTP lookup error:", otpError);
    return new Response(JSON.stringify({ error: "We couldn't verify your code right now. Please try again.", code: "lookup_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (!otpRecord) {
    return new Response(JSON.stringify({
      error: "This code is invalid or has expired. Please request a new code and try again.",
      code: "otp_not_found",
      field: "otp",
    }), {
      status: 401, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- ATTEMPT LIMIT ----
  if (otpRecord.attempts >= otpRecord.max_attempts) {
    await supabase.from("otp_verifications").update({ verified: true }).eq("id", otpRecord.id);
    return new Response(JSON.stringify({
      error: `You've entered an incorrect code ${otpRecord.attempts} times. For security, this code is now invalidated. Please request a new code.`,
      code: "otp_max_attempts",
      field: "otp",
    }), {
      status: 429, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- INCREMENT ATTEMPTS BEFORE PROCEEDING ----
  // (We do this BEFORE marking verified so even if the user submitted the right code
  //  after exhausting attempts, the check above catches it on the next call.)
  await supabase
    .from("otp_verifications")
    .update({ attempts: otpRecord.attempts + 1 })
    .eq("id", otpRecord.id);

  // ---- MARK OTP AS VERIFIED ----
  await supabase.from("otp_verifications").update({ verified: true }).eq("id", otpRecord.id);

  const role = otpRecord.role_hint || "user";
  const username = otpRecord.username_hint || null;

  // ============================================================
  // SIGNUP FLOW
  // ============================================================
  if (purpose === "signup") {
    // ---- FINAL USERNAME RE-VERIFICATION (race-condition safe) ----
    if (!username || !isValidUsername(username)) {
      return new Response(JSON.stringify({ error: "Username is missing or invalid. Please restart signup.", code: "invalid_username" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const { data: reserved } = await supabase.from("reserved_usernames").select("username").eq("username", username).maybeSingle();
    if (reserved) {
      return new Response(JSON.stringify({ error: "This username was just reserved. Please pick another and start again.", code: "username_reserved" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const { data: takenUser } = await supabase.from("users").select("user_id").eq("username", username).maybeSingle();
    if (takenUser) {
      return new Response(JSON.stringify({ error: "This username was just taken by someone else. Please pick another and start again.", code: "username_taken" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const { data: takenCreator } = await supabase.from("creators").select("user_id").eq("username", username).maybeSingle();
    if (takenCreator) {
      return new Response(JSON.stringify({ error: "This username was just taken by someone else. Please pick another and start again.", code: "username_taken" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    // ---- DOUBLE-CHECK EMAIL NOT REGISTERED IN MEANTIME ----
    const { data: existingUser } = await supabase.from("users").select("user_id").eq("email", normalizedEmail).maybeSingle();
    if (existingUser) {
      return new Response(JSON.stringify({ error: "This email was just registered. Please sign in instead.", code: "email_taken" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // ---- CREATE AUTH USER (random password — user uses OTP, never password) ----
    const randomPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 24) + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: randomPassword,
      email_confirm: true, // we already verified via OTP
      user_metadata: {
        role,
        username,
        email_verified_at: new Date().toISOString(),
      },
    });

    if (authError) {
      console.error("Auth user creation error:", authError);
      const msg = authError.message || "Failed to create account";
      if (msg.includes("already been registered") || msg.includes("already registered")) {
        return new Response(JSON.stringify({ error: "An account with this email already exists. Please sign in instead.", code: "email_taken" }), {
          status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Account creation failed: ${msg}. Please try again.`, code: "auth_create_failed" }), {
        status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    if (!authData.user) {
      return new Response(JSON.stringify({ error: "Account creation returned no user record. Please try again.", code: "auth_no_user" }), {
        status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // ---- CREATE PROFILE ROWS ----
    const { error: userRowError } = await supabase.from("users").upsert({
      user_id: authData.user.id,
      email: normalizedEmail,
      username,
      role,
    }, { onConflict: 'user_id' });

    if (userRowError) {
      console.error("users row upsert error:", userRowError);
      // Don't fail the whole signup — user can complete profile later
    }

    if (role === "creator" && username) {
      const { error: creatorRowError } = await supabase.from("creators").upsert({
        user_id: authData.user.id,
        username,
      }, { onConflict: 'user_id' });
      if (creatorRowError) {
        console.error("creators row upsert error:", creatorRowError);
      }
    }

    // ---- GENERATE A REAL SESSION for the new user ----
    // Use admin.generateLink magiclink to mint a token_hash, then verifyOtp to exchange for a session.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

    if (linkError || !linkData) {
      console.error("generateLink error (signup):", linkError?.message || "no linkData", JSON.stringify(linkData || {}).slice(0, 200));
      // User is created — they can sign in separately. Return partial success.
      return new Response(JSON.stringify({
        success: true,
        message: "Account created but we could not sign you in automatically. Please use the sign-in page to continue.",
        role,
        username,
        user_id: authData.user.id,
        requires_signin: true,
        debug_link_error: linkError?.message,
      }), {
        status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const tokenHash = extractTokenHash(linkData);
    if (!tokenHash) {
      console.error("Could not extract token_hash from action_link:", linkData?.action_link?.slice(0, 200));
      return new Response(JSON.stringify({
        success: true,
        message: "Account created but we could not extract the session token. Please sign in to continue.",
        role,
        username,
        user_id: authData.user.id,
        requires_signin: true,
        debug_action_link: linkData?.action_link?.slice(0, 200),
      }), {
        status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: sessionData, error: sessionError } = await supabaseAnon.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (sessionError || !sessionData.session) {
      console.error("Session exchange error (signup):", sessionError?.message || "no session", JSON.stringify(sessionData || {}).slice(0, 200));
      return new Response(JSON.stringify({
        success: true,
        message: "Account created but the session could not be established. Please sign in to continue.",
        role,
        username,
        user_id: authData.user.id,
        requires_signin: true,
        debug_session_error: sessionError?.message,
      }), {
        status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    await logActivity(supabase, {
      user_id: authData.user.id,
      action: "signup_completed",
      entity_type: "user",
      entity_id: authData.user.id,
      metadata: { role, username },
      req,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Account verified. Welcome to RENOWNHUB!",
      role,
      username,
      user_id: authData.user.id,
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
    }), {
      status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ============================================================
  // SIGNIN FLOW
  // ============================================================
  const { data: existingUser } = await supabase
    .from("users")
    .select("user_id, role, username, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!existingUser) {
    return new Response(JSON.stringify({
      error: "No account found with this email. Please sign up first.",
      code: "account_not_found",
    }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Mint a real session for the user
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (linkError || !linkData) {
    console.error("generateLink error (signin):", linkError);
    const msg = linkError?.message || "Unknown";
    return new Response(JSON.stringify({
      error: `We couldn't create your session right now (${msg}). Please try again in a moment.`,
      code: "session_mint_failed",
    }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const tokenHash = extractTokenHash(linkData);
  if (!tokenHash) {
    console.error("Could not extract token_hash (signin):", linkData.action_link);
    return new Response(JSON.stringify({
      error: "We couldn't create your session right now (token format issue). Please try again.",
      code: "token_extract_failed",
    }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: sessionData, error: sessionError } = await supabaseAnon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (sessionError || !sessionData.session) {
    console.error("Session exchange error (signin):", sessionError);
    const msg = sessionError?.message || "Unknown";
    return new Response(JSON.stringify({
      error: `We couldn't verify your session (${msg}). Please request a new code and try again.`,
      code: "session_exchange_failed",
    }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  await logActivity(supabase, {
    user_id: existingUser.user_id,
    action: "signin_completed",
    entity_type: "user",
    entity_id: existingUser.user_id,
    metadata: { role: existingUser.role },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Signed in successfully.",
    role: existingUser.role,
    username: existingUser.username,
    user_id: existingUser.user_id,
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_in: sessionData.session.expires_in,
  }), {
    status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});

// ---- Helpers ----

function extractTokenHash(linkData: any): string | null {
  const actionLink: string = linkData?.action_link || linkData?.properties?.action_link || "";
  if (!actionLink) return null;
  try {
    const url = new URL(actionLink);
    // Try hash fragment first (PKCE flow stores token_hash in the URL hash)
    const hash = url.hash.slice(1);
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const th = hashParams.get("token_hash") || hashParams.get("token");
      if (th) return th;
    }
    // Fallback to query params (legacy implicit flow uses ?token=)
    const th = url.searchParams.get("token_hash") || url.searchParams.get("token");
    if (th) return th;
    // Last resort: regex
    const m1 = actionLink.match(/token_hash=([^&]+)/);
    if (m1) return m1[1];
    const m2 = actionLink.match(/[?&]token=([^&]+)/);
    if (m2) return m2[1];
  } catch {
    const m1 = actionLink.match(/token_hash=([^&]+)/);
    if (m1) return m1[1];
    const m2 = actionLink.match(/[?&]token=([^&]+)/);
    if (m2) return m2[1];
  }
  return null;
}
