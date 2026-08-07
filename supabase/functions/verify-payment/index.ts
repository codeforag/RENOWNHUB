import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

// HMAC-SHA256 verification for Razorpay webhook
async function verifyRazorpaySignature(body: string, signature: string, orderId: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(RAZORPAY_KEY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${orderId}|${body}`));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expectedSig === signature;
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method === "POST") {
    try {
      const body = await req.text();
      const signature = req.headers.get("x-razorpay-signature") || "";

      const payload = JSON.parse(body);
      const payment = payload.payload?.payment?.entity;
      const order = payload.payload?.order?.entity;

      if (!payment || !order) {
        return new Response(JSON.stringify({ error: "Invalid payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify signature
      const isValid = await verifyRazorpaySignature(body, signature, order.id);
      if (!isValid) {
        console.error("Invalid Razorpay signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Find booking by Razorpay order ID
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, user_id, creator_user_id, amount, event_id")
        .eq("razorpay_order_id", order.id)
        .single();

      if (bookingError || !booking) {
        console.error("Booking not found for order:", order.id);
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paymentStatus = payment.status; // 'captured', 'failed', etc.

      if (paymentStatus === "captured") {
        // Update booking to paid
        await supabase
          .from("bookings")
          .update({
            status: "paid",
            razorpay_payment_id: payment.id,
            razorpay_signature: signature,
          })
          .eq("id", booking.id);

        // Update payment record
        await supabase
          .from("payments")
          .update({
            status: "captured",
            razorpay_payment_id: payment.id,
            razorpay_signature: signature,
          })
          .eq("razorpay_order_id", order.id);

      } else if (paymentStatus === "failed") {
        await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", booking.id);

        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("razorpay_order_id", order.id);
      }

      return new Response(
        JSON.stringify({ success: true, payment_status: paymentStatus }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      console.error("verify-payment webhook error:", err);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Manual verify endpoint (for frontend)
  if (req.method === "PUT") {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return new Response(JSON.stringify({ error: "All payment fields required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify the order exists on Razorpay
      const authStr = btoa(`${Deno.env.get("RAZORPAY_KEY_ID")}:${RAZORPAY_KEY_SECRET}`);
      const razorpayRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
        headers: { Authorization: `Basic ${authStr}` },
      });

      if (!razorpayRes.ok) {
        return new Response(JSON.stringify({ error: "Payment not found on Razorpay" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paymentData = await razorpayRes.json();

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      if (paymentData.status === "captured") {
        await supabase
          .from("bookings")
          .update({
            status: "paid",
            razorpay_payment_id,
            razorpay_signature,
          })
          .eq("razorpay_order_id", razorpay_order_id);

        await supabase
          .from("payments")
          .update({
            status: "captured",
            razorpay_payment_id,
            razorpay_signature,
          })
          .eq("razorpay_order_id", razorpay_order_id);
      }

      return new Response(
        JSON.stringify({ success: true, status: paymentData.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      console.error("verify-payment manual error:", err);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
