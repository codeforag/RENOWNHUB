import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, logActivity } from "../_shared/validation.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST is supported.", code: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return new Response(JSON.stringify({ error: "Payment gateway is not configured. Please contact support.", code: "razorpay_not_configured" }), {
      status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
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

  const { event_id, amount, currency = "INR", entity_type = "event_booking" } = body || {};

  // ---- VALIDATION ----
  if (!entity_type || !["event_booking", "membership", "service"].includes(entity_type)) {
    return new Response(JSON.stringify({ error: "entity_type must be one of: event_booking, membership, service.", code: "invalid_entity_type", field: "entity_type" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!event_id || typeof event_id !== "string") {
    return new Response(JSON.stringify({ error: "event_id is required.", code: "missing_event_id", field: "event_id" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return new Response(JSON.stringify({ error: "Amount must be a positive number.", code: "invalid_amount", field: "amount" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (amountNum > 100000) {
    return new Response(JSON.stringify({ error: "Amount must be ₹100,000 or less.", code: "amount_too_high", field: "amount" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- VERIFY EVENT EXISTS + AMOUNT MATCHES ----
  const { data: event, error: eventErr } = await supabase
    .from("live_events")
    .select("id, creator_user_id, creator_username, title, price, price_type, status")
    .eq("id", event_id)
    .maybeSingle();

  if (eventErr) {
    console.error("event lookup error:", eventErr);
    return new Response(JSON.stringify({ error: `Failed to look up event: ${eventErr.message}.`, code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!event) {
    return new Response(JSON.stringify({ error: "Event not found.", code: "event_not_found" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (event.price_type !== "paid") {
    return new Response(JSON.stringify({ error: "This event is free — no payment needed.", code: "event_is_free" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (event.status !== "scheduled" && event.status !== "live") {
    return new Response(JSON.stringify({ error: `This event is ${event.status} and can't be booked.`, code: "event_unavailable" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- VERIFY AMOUNT MATCHES SERVER ----
  const serverAmount = Number(event.price);
  if (Math.abs(serverAmount - amountNum) > 0.01) {
    return new Response(JSON.stringify({
      error: `Amount mismatch: you submitted ₹${amountNum} but the event price is ₹${serverAmount}. Please refresh and try again.`,
      code: "amount_mismatch",
      server_amount: serverAmount,
      submitted_amount: amountNum,
    }), { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }

  // ---- PREVENT BOOKING OWN EVENT ----
  if (event.creator_user_id === user.id) {
    return new Response(JSON.stringify({ error: "You can't book your own event.", code: "own_event" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- CHECK EXISTING BOOKING ----
  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("event_id", event_id)
    .eq("user_id", user.id)
    .in("status", ["pending", "paid"])
    .maybeSingle();
  if (existingBooking) {
    return new Response(JSON.stringify({ error: "You already have a booking for this event.", code: "already_booked", already_booked: true }), {
      status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- CREATE RAZORPAY ORDER ----
  const receipt = `rcpt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const authStr = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
  const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${authStr}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(amountNum * 100),
      currency,
      receipt,
      notes: {
        event_id,
        user_id: user.id,
        creator_user_id: event.creator_user_id,
        entity_type,
      },
    }),
  });

  if (!razorpayRes.ok) {
    const errText = await razorpayRes.text();
    console.error("Razorpay order create error:", razorpayRes.status, errText);
    let msg = "Payment gateway error.";
    if (razorpayRes.status === 401) msg = "Payment gateway authentication failed. Please contact support.";
    else if (razorpayRes.status === 429) msg = "Payment gateway rate limit reached. Please try again in a minute.";
    return new Response(JSON.stringify({ error: msg, code: "razorpay_error", gateway_status: razorpayRes.status }), {
      status: 502, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const razorpayOrder = await razorpayRes.json();

  // ---- CREATE PENDING BOOKING ----
  const { error: bookingErr } = await supabase.from("bookings").insert({
    event_id,
    user_id: user.id,
    creator_user_id: event.creator_user_id,
    amount: amountNum,
    currency,
    status: "pending",
    razorpay_order_id: razorpayOrder.id,
  });

  if (bookingErr) {
    console.error("booking insert error:", bookingErr);
    return new Response(JSON.stringify({ error: `Failed to create booking: ${bookingErr.message}.`, code: "booking_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- CREATE PAYMENT RECORD ----
  await supabase.from("payments").insert({
    user_id: user.id,
    creator_user_id: event.creator_user_id,
    amount: amountNum,
    currency,
    razorpay_order_id: razorpayOrder.id,
    status: "pending",
    entity_type,
    entity_id: event_id,
  });

  await logActivity(supabase, {
    user_id: user.id,
    action: "razorpay_order_created",
    entity_type: "booking",
    metadata: { event_id, amount: amountNum, order_id: razorpayOrder.id },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Order created. Complete the payment to confirm your booking.",
    order_id: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key: RAZORPAY_KEY_ID,
  }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
});
