import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Support both GET with ?username= and POST with body
    let username: string | null = null;
    if (req.method === "GET") {
      const url = new URL(req.url);
      username = url.searchParams.get("username");
    } else {
      const body = await req.json();
      username = body.username;
    }

    if (!username || typeof username !== "string") {
      return new Response(JSON.stringify({ error: "Username is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SERVER-SIDE VALIDATION
    const trimmed = username.trim().toLowerCase();
    const usernameRegex = /^[a-zA-Z0-9_.]{3,20}$/;
    if (!usernameRegex.test(trimmed)) {
      return new Response(
        JSON.stringify({
          available: false,
          reason: "Username must be 3-20 characters (letters, numbers, underscore, dot)",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check 1: Reserved usernames
    const { data: reserved } = await supabase
      .from("reserved_usernames")
      .select("username")
      .eq("username", trimmed)
      .maybeSingle();

    if (reserved) {
      return new Response(
        JSON.stringify({ available: false, reason: "This username is reserved" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check 2: Already taken in users table
    const { data: takenUser } = await supabase
      .from("users")
      .select("user_id")
      .eq("username", trimmed)
      .maybeSingle();

    if (takenUser) {
      return new Response(
        JSON.stringify({ available: false, reason: "Username already taken" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check 3: Already taken in creators table
    const { data: takenCreator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("username", trimmed)
      .maybeSingle();

    if (takenCreator) {
      return new Response(
        JSON.stringify({ available: false, reason: "Username already taken" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ available: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-username error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
