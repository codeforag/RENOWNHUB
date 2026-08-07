import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, logActivity } from "../_shared/validation.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

/**
 * Razorpay signs webhook payloads with HMAC-SHA256 over the **raw request body**,
 * using the Webhook Secret configured in the Razorpay dashboard (NOT the API key secret).
 * This function verifies that signature.
 */
async function verifyWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const keyBytes = new TextEncoder().encode(secret);
  const bodyBytes = new TextEncoder().encode(rawBody);
  const hmacKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", hmacKey, bodyBytes);
  const expectedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time-ish compare
  if (expectedSig.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Manual (frontend) verification — uses the API key secret to sign
 * `${order_id}|${payment_id}` (Razorpay's standard for client-side flows).
 */
async function verifyManualSignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  if (!RAZORPAY_KEY_SECRET) return false;
  const keyBytes = new TextEncoder().encode(RAZORPAY_KEY_SECRET);
  const dataBytes = new TextEncoder().encode(`${orderId}|${paymentId}`);
  const hmacKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", hmacKey, dataBytes);
  const expectedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expectedSig.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  // ============================================================
  // POST: WEBHOOK (called by Razorpay)
  // ============================================================
  if (req.method === "POST") {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      console.error("RAZORPAY_WEBHOOK_SECRET not set");
      return new Response(JSON.stringify({ error: "Webhook secret not configured.", code: "webhook_not_configured" }), {
        status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing x-razorpay-signature header.", code: "missing_signature" }), {
        status: 401, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyWebhookSignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid webhook signature.", code: "invalid_signature" }), {
        status: 401, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Webhook body is not valid JSON.", code: "bad_json" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const payment = payload?.payload?.payment?.entity;
    const order = payload?.payload?.order?.entity;
    if (!payment || !order) {
      return new Response(JSON.stringify({ error: "Webhook payload missing payment or order entity.", code: "bad_payload" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find booking by Razorpay order ID (event bookings)
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, creator_user_id, amount, event_id")
      .eq("razorpay_order_id", order.id)
      .maybeSingle();

    if (booking) {
      if (payment.status === "captured") {
        await supabase.from("bookings").update({
          status: "paid",
          razorpay_payment_id: payment.id,
          razorpay_signature: signature,
        }).eq("id", booking.id);

        await supabase.from("payments").update({
          status: "captured",
          razorpay_payment_id: payment.id,
          razorpay_signature: signature,
        }).eq("razorpay_order_id", order.id);

        await logActivity(supabase, {
          user_id: booking.user_id,
          action: "booking_paid_webhook",
          entity_type: "booking",
          entity_id: booking.id,
          metadata: { amount: booking.amount, razorpay_order_id: order.id },
        });
      } else if (payment.status === "failed") {
        await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
        await supabase.from("payments").update({ status: "failed" }).eq("razorpay_order_id", order.id);
      }
    } else {
      // Maybe it's a post unlock payment
      const { data: unlock } = await supabase
        .from("post_unlocks")
        .select("id, user_id, post_id")
        .eq("razorpay_order_id", order.id)
        .maybeSingle();
      if (unlock && payment.status === "captured") {
        // Already verified via manual PUT — just update payment record
        await supabase.from("payments").update({
          status: "captured",
          razorpay_payment_id: payment.id,
          razorpay_signature: signature,
        }).eq("razorpay_order_id", order.id);
      }
    }

    return new Response(JSON.stringify({ success: true, payment_status: payment.status }), {
      status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ============================================================
  // PUT: MANUAL VERIFICATION (called by frontend after Razorpay checkout)
  // ============================================================
  if (req.method === "PUT") {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { user, error: authError } = await requireUser(req, SUPABASE_URL, ANON_KEY);
    if (authError) return authError;

    let body: any;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "All payment fields (order_id, payment_id, signature) are required.", code: "missing_fields" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // ---- VERIFY HMAC SIGNATURE SERVER-SIDE (security-critical) ----
    const sigOk = await verifyManualSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!sigOk) {
      console.error("Manual signature verification failed for order:", razorpay_order_id);
      return new Response(JSON.stringify({
        error: "Payment signature verification failed. The payment details may be invalid or tampered with. If you were charged, please contact support with your order ID.",
        code: "invalid_signature",
        order_id: razorpay_order_id,
      }), { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Update bookings + payments
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, creator_user_id, amount, event_id")
      .eq("razorpay_order_id", razorpay_order_id)
      .maybeSingle();

    if (booking) {
      if (booking.user_id !== user.id && booking.creator_user_id !== user.id) {
        return new Response(JSON.stringify({ error: "This payment does not belong to your account.", code: "not_owner" }), {
          status: 403, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
      await supabase.from("bookings").update({
        status: "paid",
        razorpay_payment_id,
        razorpay_signature,
      }).eq("razorpay_order_id", razorpay_order_id);

      await supabase.from("payments").update({
        status: "captured",
        razorpay_payment_id,
        razorpay_signature,
      }).eq("razorpay_order_id", razorpay_order_id);

      return new Response(JSON.stringify({
        success: true,
        message: "Payment verified successfully. Your booking is confirmed.",
        status: "captured",
      }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      error: "No booking found for this order ID. If you were charged, please contact support.",
      code: "booking_not_found",
      order_id: razorpay_order_id,
    }), { status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Only POST (webhook) or PUT (manual verify) is supported.", code: "method_not_allowed" }), {
    status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
