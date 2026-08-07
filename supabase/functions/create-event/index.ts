import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, logActivity } from "../_shared/validation.ts";

const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 1000;
const MAX_ATTENDEES = 100000;
const MAX_PRICE = 100000;

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
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { title, description, event_when, duration_minutes, price_type, price, max_attendees } = body || {};

  // ---- VALIDATION ----
  if (!title || typeof title !== "string" || title.trim().length < 3) {
    return new Response(JSON.stringify({ error: "Event title is required (min 3 characters).", code: "invalid_title", field: "title" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (title.length > MAX_TITLE_LEN) {
    return new Response(JSON.stringify({ error: `Title is too long (max ${MAX_TITLE_LEN} chars).`, code: "title_too_long", field: "title" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (description && (typeof description !== "string" || description.length > MAX_DESC_LEN)) {
    return new Response(JSON.stringify({ error: `Description must be ${MAX_DESC_LEN} chars or fewer.`, code: "desc_too_long", field: "description" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!event_when || typeof event_when !== "string") {
    return new Response(JSON.stringify({ error: "Event date/time is required.", code: "missing_when", field: "event_when" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  const whenDate = new Date(event_when);
  if (isNaN(whenDate.getTime())) {
    return new Response(JSON.stringify({ error: "Invalid event date/time.", code: "invalid_when", field: "event_when" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  // Allow events in the past up to 1 hour ago (in case of "start now" latency)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (whenDate < oneHourAgo) {
    return new Response(JSON.stringify({ error: "Event date cannot be in the past.", code: "past_when", field: "event_when" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  // Max 2 years in future
  const twoYearsAhead = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
  if (whenDate > twoYearsAhead) {
    return new Response(JSON.stringify({ error: "Event date is too far in the future (max 2 years).", code: "too_far_when", field: "event_when" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!["free", "paid"].includes(price_type)) {
    return new Response(JSON.stringify({ error: "Price type must be 'free' or 'paid'.", code: "invalid_price_type", field: "price_type" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  let priceNum = 0;
  if (price_type === "paid") {
    priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return new Response(JSON.stringify({ error: "Paid events must have a valid price greater than 0.", code: "invalid_price", field: "price" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (priceNum > MAX_PRICE) {
      return new Response(JSON.stringify({ error: `Price must be ₹${MAX_PRICE} or less.`, code: "price_too_high", field: "price" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }
  if (duration_minutes !== undefined && (typeof duration_minutes !== "number" || duration_minutes < 1 || duration_minutes > 24 * 60)) {
    return new Response(JSON.stringify({ error: "Duration must be between 1 and 1440 minutes.", code: "invalid_duration", field: "duration_minutes" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (max_attendees !== undefined && max_attendees !== null) {
    if (typeof max_attendees !== "number" || max_attendees < 1 || max_attendees > MAX_ATTENDEES) {
      return new Response(JSON.stringify({ error: `Max attendees must be between 1 and ${MAX_ATTENDEES}.`, code: "invalid_max_attendees", field: "max_attendees" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- ROLE + CREATOR CHECK ----
  const { data: creator, error: creatorErr } = await supabase
    .from("creators")
    .select("user_id, username")
    .eq("user_id", user.id)
    .maybeSingle();
  if (creatorErr) {
    console.error("creator lookup error:", creatorErr);
    return new Response(JSON.stringify({ error: "Failed to verify creator account.", code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!creator) {
    return new Response(JSON.stringify({ error: "Only creators can create live events.", code: "not_creator" }), {
      status: 403, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- DETERMINE STATUS ----
  const isNow = Math.abs(whenDate.getTime() - Date.now()) < 5 * 60 * 1000; // within 5 min = "live now"
  const status = isNow ? "live" : "scheduled";

  // ---- INSERT EVENT ----
  const { data: event, error: insertErr } = await supabase
    .from("live_events")
    .insert({
      creator_user_id: user.id,
      creator_username: creator.username,
      title: title.trim(),
      description: description?.trim() || null,
      event_when: whenDate.toISOString(),
      duration_minutes: duration_minutes ?? 60,
      price_type,
      price: price_type === "paid" ? priceNum : 0,
      currency: "INR",
      status,
      max_attendees: max_attendees ?? null,
    })
    .select("id, title, event_when, price_type, price, status, max_attendees")
    .single();

  if (insertErr) {
    console.error("event insert error:", insertErr);
    return new Response(JSON.stringify({ error: `Failed to create event: ${insertErr.message}. Please try again.`, code: "insert_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  await logActivity(supabase, {
    user_id: user.id,
    action: "event_created",
    entity_type: "live_event",
    entity_id: event.id,
    metadata: { title: title.trim(), price_type, status },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: status === "live" ? "Your live event is now active!" : "Event scheduled successfully!",
    event,
  }), { status: 201, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
});
