import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { isValidUsername, normalizeUsername, logActivity } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Only POST or GET is supported.", code: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let username: string | null = null;
  if (req.method === "GET") {
    const url = new URL(req.url);
    username = url.searchParams.get("username");
  } else {
    try {
      const body = await req.json();
      username = body.username;
    } catch {
      return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  if (!username) {
    return new Response(JSON.stringify({ error: "Username is required.", code: "missing_username", field: "username" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const normalized = normalizeUsername(username);

  if (!isValidUsername(username)) {
    return new Response(JSON.stringify({
      available: false,
      reason: "Username must be 3-20 characters using only letters, numbers, underscores, or dots.",
      code: "invalid_format",
      field: "username",
    }), {
      status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Server is not fully configured.", code: "server_misconfigured" }), {
      status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Check 1: reserved
  const { data: reserved, error: reservedErr } = await supabase
    .from("reserved_usernames")
    .select("username")
    .eq("username", normalized)
    .maybeSingle();
  if (reservedErr) {
    console.error("reserved_usernames query error:", reservedErr);
    return new Response(JSON.stringify({ error: "We couldn't check username availability right now. Please try again.", code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (reserved) {
    return new Response(JSON.stringify({
      available: false,
      reason: "This username is reserved and cannot be used.",
      code: "reserved",
    }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }

  // Check 2: taken in users table
  const { data: takenUser } = await supabase
    .from("users")
    .select("user_id")
    .eq("username", normalized)
    .maybeSingle();
  if (takenUser) {
    return new Response(JSON.stringify({
      available: false,
      reason: "This username is already taken. Try another.",
      code: "taken",
    }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }

  // Check 3: taken in creators table
  const { data: takenCreator } = await supabase
    .from("creators")
    .select("user_id")
    .eq("username", normalized)
    .maybeSingle();
  if (takenCreator) {
    return new Response(JSON.stringify({
      available: false,
      reason: "This username is already taken. Try another.",
      code: "taken",
    }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    available: true,
    reason: "This username is available.",
    username: normalized,
  }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
});
