import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, isValidUsername, normalizeUsername, logActivity } from "../_shared/validation.ts";

const VALID_THEME_COLORS = ["#f1a2b5", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];
const MAX_BIO_LEN = 500;
const MAX_DISPLAY_NAME_LEN = 80;

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "PUT" && req.method !== "PATCH") {
    return new Response(JSON.stringify({ error: "Only PUT or PATCH is supported.", code: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const { user, error: authError } = await requireUser(req, SUPABASE_URL, ANON_KEY);
  if (authError) return authError;

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { display_name, bio, theme_color, social, username, avatar_url, banner_url } = body || {};

  // ---- VALIDATION ----
  if (display_name !== undefined) {
    if (typeof display_name !== "string" || display_name.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Display name must be at least 2 characters.", code: "invalid_name", field: "display_name" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (display_name.trim().length > MAX_DISPLAY_NAME_LEN) {
      return new Response(JSON.stringify({ error: `Display name must be ${MAX_DISPLAY_NAME_LEN} characters or fewer.`, code: "name_too_long", field: "display_name" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }
  if (bio !== undefined) {
    if (typeof bio !== "string" || bio.length > MAX_BIO_LEN) {
      return new Response(JSON.stringify({ error: `Bio must be ${MAX_BIO_LEN} characters or fewer.`, code: "bio_too_long", field: "bio" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }
  if (theme_color !== undefined) {
    if (typeof theme_color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(theme_color)) {
      return new Response(JSON.stringify({ error: "Theme color must be a valid hex color (e.g. #f1a2b5).", code: "invalid_color", field: "theme_color" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }
  if (avatar_url !== undefined && avatar_url !== null) {
    if (typeof avatar_url !== "string" || !avatar_url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Avatar URL must be a valid http(s) URL.", code: "invalid_avatar", field: "avatar_url" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }
  if (banner_url !== undefined && banner_url !== null) {
    if (typeof banner_url !== "string" || !banner_url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Banner URL must be a valid http(s) URL.", code: "invalid_banner", field: "banner_url" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }
  if (username !== undefined && username !== null) {
    if (!isValidUsername(username)) {
      return new Response(JSON.stringify({ error: "Username must be 3-20 characters using only letters, numbers, underscores, or dots.", code: "invalid_username", field: "username" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }
  if (social !== undefined && social !== null) {
    if (typeof social !== "object" || Array.isArray(social)) {
      return new Response(JSON.stringify({ error: "Social must be an object with platform keys.", code: "invalid_social" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- ROLE + CREATOR PROFILE CHECK ----
  const { data: userData, error: userDataErr } = await supabase
    .from("users")
    .select("role, username")
    .eq("user_id", user.id)
    .maybeSingle();

  if (userDataErr) {
    console.error("users lookup error:", userDataErr);
    return new Response(JSON.stringify({ error: "We couldn't verify your account. Please try again.", code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!userData) {
    return new Response(JSON.stringify({ error: "Account not found. Please sign in again.", code: "account_not_found" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (userData.role !== "creator") {
    return new Response(JSON.stringify({ error: "Only creator accounts can update creator profiles.", code: "not_creator" }), {
      status: 403, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- USERNAME AVAILABILITY (if changing) ----
  let finalUsername: string | undefined = undefined;
  if (username !== undefined && username !== null) {
    finalUsername = normalizeUsername(username);
    if (finalUsername !== userData.username) {
      // Check reserved
      const { data: reserved } = await supabase
        .from("reserved_usernames")
        .select("username")
        .eq("username", finalUsername)
        .maybeSingle();
      if (reserved) {
        return new Response(JSON.stringify({ error: "This username is reserved. Please choose another.", code: "username_reserved", field: "username" }), {
          status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
      // Check taken in creators
      const { data: takenCreator } = await supabase
        .from("creators")
        .select("user_id")
        .eq("username", finalUsername)
        .neq("user_id", user.id)
        .maybeSingle();
      if (takenCreator) {
        return new Response(JSON.stringify({ error: "This username is already taken. Please choose another.", code: "username_taken", field: "username" }), {
          status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
      // Check taken in users
      const { data: takenUser } = await supabase
        .from("users")
        .select("user_id")
        .eq("username", finalUsername)
        .neq("user_id", user.id)
        .maybeSingle();
      if (takenUser) {
        return new Response(JSON.stringify({ error: "This username is already taken. Please choose another.", code: "username_taken", field: "username" }), {
          status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
    } else {
      finalUsername = undefined; // no actual change
    }
  }

  // ---- BUILD UPDATE PAYLOAD ----
  const creatorUpdate: Record<string, unknown> = {};
  if (display_name !== undefined) creatorUpdate.display_name = display_name.trim();
  if (bio !== undefined) creatorUpdate.bio = bio;
  if (theme_color !== undefined) creatorUpdate.theme_color = theme_color;
  if (social !== undefined) creatorUpdate.social = social;
  if (finalUsername !== undefined) creatorUpdate.username = finalUsername;
  if (avatar_url !== undefined) creatorUpdate.avatar_url = avatar_url;
  if (banner_url !== undefined) creatorUpdate.banner_url = banner_url;

  if (Object.keys(creatorUpdate).length > 0) {
    const { error } = await supabase
      .from("creators")
      .update(creatorUpdate)
      .eq("user_id", user.id);

    if (error) {
      console.error("creator update error:", error);
      return new Response(JSON.stringify({ error: `Failed to update creator profile: ${error.message}. Please try again.`, code: "update_failed" }), {
        status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  // ---- SYNC display_name to users table ----
  if (display_name !== undefined) {
    await supabase.from("users").update({ display_name: display_name.trim() }).eq("user_id", user.id);
  }
  // ---- SYNC username to users table ----
  if (finalUsername !== undefined) {
    await supabase.from("users").update({ username: finalUsername }).eq("user_id", user.id);
    // Also update creator_username on all their live_events + posts
    await supabase.from("live_events").update({ creator_username: finalUsername }).eq("creator_user_id", user.id);
    await supabase.from("posts").update({ creator_username: finalUsername }).eq("creator_user_id", user.id);
  }

  await logActivity(supabase, {
    user_id: user.id,
    action: "creator_profile_updated",
    entity_type: "creator",
    entity_id: user.id,
    metadata: { fields: Object.keys(creatorUpdate) },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Profile updated successfully. Your changes are now live.",
    username: finalUsername ?? userData.username,
  }), {
    status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
