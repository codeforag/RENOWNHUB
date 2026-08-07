import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "PUT" && req.method !== "PATCH") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
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

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates = await req.json();
    const {
      display_name,
      bio,
      theme_color,
      social,
      username,
    } = updates;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If username change requested, check availability
    if (username && typeof username === "string") {
      const usernameRegex = /^[a-zA-Z0-9_.]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return new Response(
          JSON.stringify({ error: "Invalid username format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: taken } = await supabase
        .from("creators")
        .select("user_id")
        .eq("username", username)
        .neq("user_id", user.id)
        .maybeSingle();

      if (taken) {
        return new Response(
          JSON.stringify({ error: "Username already taken" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build update payload (only include provided fields)
    const creatorUpdate: Record<string, unknown> = {};
    if (display_name !== undefined) creatorUpdate.display_name = display_name;
    if (bio !== undefined) creatorUpdate.bio = bio;
    if (theme_color !== undefined) creatorUpdate.theme_color = theme_color;
    if (social !== undefined) creatorUpdate.social = social;
    if (username !== undefined) creatorUpdate.username = username;

    if (Object.keys(creatorUpdate).length > 0) {
      const { error } = await supabase
        .from("creators")
        .update(creatorUpdate)
        .eq("user_id", user.id);

      if (error) {
        console.error("Creator update error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to update creator profile" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Also update users table display_name
    if (display_name !== undefined) {
      await supabase
        .from("users")
        .update({ display_name })
        .eq("user_id", user.id);
    }

    // Sync username to users table too
    if (username !== undefined) {
      await supabase
        .from("users")
        .update({ username })
        .eq("user_id", user.id);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Profile updated" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-creator error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
