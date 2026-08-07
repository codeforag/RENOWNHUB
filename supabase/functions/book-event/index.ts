import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, logActivity } from "../_shared/validation.ts";

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

  // Require authentication — no anonymous bookings
  const { user, error: authError } = await requireUser(req, SUPABASE_URL, ANON_KEY);
  if (authError) return authError;

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { event_id } = body || {};
  if (!event_id || typeof event_id !== "string") {
    return new Response(JSON.stringify({ error: "event_id is required.", code: "missing_event_id" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- VERIFY EVENT ----
  const { data: event, error: eventErr } = await supabase
    .from("live_events")
    .select("id, creator_user_id, creator_username, title, price_type, status, max_attendees, event_when")
    .eq("id", event_id)
    .maybeSingle();

  if (eventErr) {
    console.error("event lookup error:", eventErr);
    return new Response(JSON.stringify({ error: `Failed to look up event: ${eventErr.message}.`, code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!event) {
    return new Response(JSON.stringify({ error: "Event not found. It may have been removed.", code: "event_not_found" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (event.price_type !== "free") {
    return new Response(JSON.stringify({
      error: "This is a paid event. Please use the payment flow to book.",
      code: "paid_event",
      redirect_to_payment: true,
    }), { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }
  if (event.status !== "scheduled" && event.status !== "live") {
    return new Response(JSON.stringify({ error: `This event is ${event.status} and cannot be booked.`, code: "event_unavailable" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- PREVENT BOOKING OWN EVENT ----
  if (event.creator_user_id === user.id) {
    return new Response(JSON.stringify({ error: "You can't book your own event.", code: "own_event" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- CHECK CAPACITY ----
  if (event.max_attendees) {
    const { count } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event_id)
      .in("status", ["pending", "paid"]);
    if (count && count >= event.max_attendees) {
      return new Response(JSON.stringify({ error: `This event is full (${count}/${event.max_attendees} attendees).`, code: "event_full" }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  // ---- PREVENT DOUBLE-BOOKING ----
  const { data: existing } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", event_id)
    .eq("user_id", user.id)
    .in("status", ["pending", "paid"])
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ error: "You've already booked this event.", code: "already_booked", already_booked: true }), {
      status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- CREATE BOOKING ----
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .insert({
      event_id,
      user_id: user.id,
      creator_user_id: event.creator_user_id,
      amount: 0,
      currency: "INR",
      status: "paid", // free events auto-confirm
    })
    .select("id")
    .single();

  if (bookingErr) {
    console.error("booking insert error:", bookingErr);
    if (bookingErr.code === "23505") {
      return new Response(JSON.stringify({ error: "You've already booked this event.", code: "already_booked", already_booked: true }), {
        status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: `Failed to book event: ${bookingErr.message}. Please try again.`, code: "booking_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  await logActivity(supabase, {
    user_id: user.id,
    action: "event_booked",
    entity_type: "booking",
    entity_id: booking.id,
    metadata: { event_id, event_title: event.title },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: `You're booked for "${event.title}". See you there!`,
    booking_id: booking.id,
  }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
});
