import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

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
    const { email, otp, purpose = "signin" } = await req.json();

    // ---- SERVER-SIDE VALIDATION ----
    if (!email || !otp) {
      return new Response(JSON.stringify({ error: "Email and OTP are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== "string" || !emailRegex.test(email.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Purpose must be 'signin' or 'signup'
    if (!["signin", "signup"].includes(purpose)) {
      return new Response(JSON.stringify({ error: "Invalid purpose" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OTP must be a string type check
    if (typeof otp !== "string") {
      return new Response(JSON.stringify({ error: "OTP must be a string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return new Response(JSON.stringify({ error: "OTP must be 6 digits" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Clean expired OTPs first (non-fatal if RPC missing)
    try {
      await supabase.rpc("clean_expired_otps");
    } catch {
      // Non-fatal: continue even if the RPC doesn't exist
    }

    // Find valid OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_verifications")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("otp_code", otp)
      .eq("purpose", purpose)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      return new Response(JSON.stringify({ error: "Invalid or expired OTP" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check attempt limit BEFORE incrementing
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      await supabase
        .from("otp_verifications")
        .update({ verified: true })
        .eq("id", otpRecord.id);
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please request a new OTP." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment attempts
    await supabase
      .from("otp_verifications")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    // (Removed dead code: OTP match check after query already matched)

    // Mark OTP as verified
    await supabase
      .from("otp_verifications")
      .update({ verified: true })
      .eq("id", otpRecord.id);

    // Determine role
    const role = otpRecord.role_hint || "user";
    const username = otpRecord.username_hint || null;

    if (purpose === "signup") {
      // For signup: create the auth user and profile row
      // Generate a random password (user never uses it - OTP-based auth)
      const randomPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 24);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password: randomPassword,
        options: {
          data: {
            role: role,
            username: username,
          },
        },
      });

      if (authError) {
        console.error("Auth signup error:", authError);
        return new Response(
          JSON.stringify({ error: "Failed to create account. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (authData.user) {
        // Create users table row
        await supabase.from("users").upsert({
          user_id: authData.user.id,
          email: email.toLowerCase(),
          username: username,
          display_name: null,
          role: role,
        });

        // If creator, create creators row too
        if (role === "creator" && username) {
          await supabase.from("creators").upsert({
            user_id: authData.user.id,
            username: username,
            display_name: null,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Account verified",
          role,
          username,
          user_id: authData.user?.id,
          access_token: authData.session?.access_token,
          refresh_token: authData.session?.refresh_token,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Signin: verify the user exists, create a real session
      const { data: existingUser } = await supabase
        .from("users")
        .select("user_id, role, username")
        .eq("email", email.toLowerCase())
        .single();

      if (!existingUser) {
        return new Response(
          JSON.stringify({ error: "No account found. Please sign up." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate a magic link to obtain a token_hash, then exchange for a real session
      const { data: adminData, error: adminError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: email.toLowerCase(),
      });

      if (adminError || !adminData) {
        console.error("Generate link error:", adminError);
        return new Response(
          JSON.stringify({ error: "Failed to create session. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract token_hash from the action_link URL
      const actionLink = adminData.action_link;
      let tokenHash: string | null = null;
      try {
        const url = new URL(actionLink);
        tokenHash = url.hash.slice(1); // Remove leading '#'
      } catch {
        // Fallback: try to extract token_hash from query params or hash
        const match = actionLink.match(/token_hash=([^&]+)/);
        if (match) tokenHash = match[1];
      }

      if (!tokenHash) {
        console.error("Could not extract token_hash from action_link:", actionLink);
        return new Response(
          JSON.stringify({ error: "Failed to create session. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Exchange token_hash for a real session using the anon client
      const supabaseAnon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!
      );

      const { data: sessionData, error: sessionError } = await supabaseAnon.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });

      if (sessionError || !sessionData.session) {
        console.error("Session exchange error:", sessionError);
        return new Response(
          JSON.stringify({ error: "Failed to create session. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "OTP verified",
          role: existingUser.role,
          username: existingUser.username,
          user_id: existingUser.user_id,
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("verify-otp error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
