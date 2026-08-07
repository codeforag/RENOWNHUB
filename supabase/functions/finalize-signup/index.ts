import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, logActivity } from "../_shared/validation.ts";

const VALID_GENDERS = ["female", "male", "non-binary", "prefer_not_to_say"];
const VALID_CATEGORIES = [
  "fitness", "photographer", "singer", "dancer", "teacher", "personal-coach",
  "wellness-coach", "artist", "gamer", "chef", "comedian", "exclusive",
];

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeGender(g: string | null | undefined): string | null {
  if (!g) return null;
  return g.trim().toLowerCase().replace(/ /g, "_");
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST is supported.", code: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const { user, error: authError } = await requireUser(req, SUPABASE_URL, ANON_KEY);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { fullName, gender, dob, categories, socials } = body || {};

  // ---- VALIDATION ----
  if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
    return new Response(JSON.stringify({ error: "Full name is required (minimum 2 characters).", code: "invalid_name", field: "fullName" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (fullName.trim().length > 80) {
    return new Response(JSON.stringify({ error: "Full name must be 80 characters or fewer.", code: "name_too_long", field: "fullName" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const normalizedGender = normalizeGender(gender);
  if (normalizedGender && !VALID_GENDERS.includes(normalizedGender)) {
    return new Response(JSON.stringify({ error: `Invalid gender. Must be one of: ${VALID_GENDERS.join(", ")}.`, code: "invalid_gender", field: "gender" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let dobDate: Date | null = null;
  if (dob) {
    dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      return new Response(JSON.stringify({ error: "Date of birth is not a valid date.", code: "invalid_dob", field: "dob" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const m = today.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
    if (age < 18) {
      return new Response(JSON.stringify({ error: "You must be at least 18 years old to create an account.", code: "underage", field: "dob" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (age > 120) {
      return new Response(JSON.stringify({ error: "Please enter a valid date of birth.", code: "invalid_dob", field: "dob" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  if (categories && !Array.isArray(categories)) {
    return new Response(JSON.stringify({ error: "Categories must be an array of strings.", code: "invalid_categories" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (categories && categories.length > 3) {
    return new Response(JSON.stringify({ error: "You can pick up to 3 categories.", code: "too_many_categories" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (categories && Array.isArray(categories)) {
    for (const c of categories) {
      if (typeof c !== "string" || !VALID_CATEGORIES.includes(c)) {
        return new Response(JSON.stringify({ error: `Invalid category: ${c}. Must be one of: ${VALID_CATEGORIES.join(", ")}.`, code: "invalid_category" }), {
          status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
    }
  }

  // Validate socials (each must be a valid URL or short handle)
  const validatedSocials: Record<string, string> = {};
  if (socials && typeof socials === "object") {
    const allowedKeys = ["instagram", "facebook", "snapchat", "youtube", "x", "threads", "linkedin"];
    for (const key of allowedKeys) {
      const val = socials[key];
      if (!val || typeof val !== "string") continue;
      const trimmed = val.trim();
      if (!trimmed) continue;
      if (trimmed.length > 200) {
        return new Response(JSON.stringify({ error: `${key} link is too long (200 chars max).`, code: "social_too_long", field: `socials.${key}` }), {
          status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
      // If it looks like a URL, validate
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        if (!isValidUrl(trimmed)) {
          return new Response(JSON.stringify({ error: `${key} must be a valid URL.`, code: "invalid_social_url", field: `socials.${key}` }), {
            status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
          });
        }
        validatedSocials[key] = trimmed;
      } else {
        // Treat as a short handle
        if (!/^[a-zA-Z0-9_.@-]{1,30}$/.test(trimmed.replace(/^@/, ""))) {
          return new Response(JSON.stringify({ error: `${key} handle must be 1-30 alphanumeric characters.`, code: "invalid_social_handle", field: `socials.${key}` }), {
            status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
          });
        }
        validatedSocials[key] = trimmed.replace(/^@/, "");
      }
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- UPDATE USERS TABLE ----
  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      display_name: fullName.trim(),
      gender: normalizedGender,
      dob: dobDate ? dobDate.toISOString().slice(0, 10) : null,
    })
    .eq("user_id", user.id);

  if (userUpdateError) {
    console.error("users update error:", userUpdateError);
    return new Response(JSON.stringify({ error: `Failed to update your profile: ${userUpdateError.message}. Please try again.`, code: "update_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- UPDATE CREATORS TABLE IF CREATOR ----
  const { data: userData, error: userDataErr } = await supabase
    .from("users")
    .select("role, username")
    .eq("user_id", user.id)
    .single();

  if (userDataErr || !userData) {
    return new Response(JSON.stringify({ error: "Your account record could not be found. Please contact support.", code: "user_not_found" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (userData.role === "creator") {
    const { error: creatorError } = await supabase
      .from("creators")
      .update({
        display_name: fullName.trim(),
        categories: categories || [],
        social: validatedSocials,
      })
      .eq("user_id", user.id);

    if (creatorError) {
      console.error("creators update error:", creatorError);
      return new Response(JSON.stringify({ error: `Failed to save your creator profile: ${creatorError.message}. Please try again.`, code: "creator_update_failed" }), {
        status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  // ---- PERSIST APP STATE ----
  const statePayload = {
    fullName: fullName.trim(),
    gender: normalizedGender,
    dob: dobDate ? dobDate.toISOString().slice(0, 10) : null,
    categories: categories || [],
    socials: validatedSocials,
    onboardingCompleted: true,
  };

  await supabase.from("app_user_state").upsert({
    user_id: user.id,
    state: statePayload,
  }, { onConflict: 'user_id' });

  await logActivity(supabase, {
    user_id: user.id,
    action: "onboarding_completed",
    entity_type: "user",
    entity_id: user.id,
    metadata: { role: userData.role },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Profile saved successfully. Welcome aboard!",
    role: userData.role,
  }), {
    status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
