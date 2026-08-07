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
    // Get user from authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fullName, gender, dob, categories, socials, username } = await req.json();

    // SERVER-SIDE VALIDATION
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Full name is required (min 2 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (gender && !["female", "male", "non-binary", "prefer_not_to_say"].includes(gender)) {
      return new Response(JSON.stringify({ error: "Invalid gender value" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dob) {
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 18) {
        return new Response(JSON.stringify({ error: "You must be at least 18 years old" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (categories && !Array.isArray(categories)) {
      return new Response(JSON.stringify({ error: "Categories must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Update users table
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        display_name: fullName.trim(),
        gender: gender || null,
        dob: dob || null,
      })
      .eq("user_id", user.id);

    if (userUpdateError) {
      console.error("User update error:", userUpdateError);
      return new Response(
        JSON.stringify({ error: "Failed to update profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update creators table if creator role
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (userData?.role === "creator") {
      const { error: creatorError } = await supabase
        .from("creators")
        .update({
          display_name: fullName.trim(),
          categories: categories || [],
          social: socials || {},
        })
        .eq("user_id", user.id);

      if (creatorError) {
        console.error("Creator update error:", creatorError);
      }
    }

    // Persist app state
    const statePayload = {
      fullName: fullName.trim(),
      gender: gender || null,
      dob: dob || null,
      categories: categories || [],
      socials: socials || {},
      onboardingCompleted: true,
    };

    await supabase.from("app_user_state").upsert({
      user_id: user.id,
      state: statePayload,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Profile finalized" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("finalize-signup error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
