import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

function generateReceiptId(): string {
  return `rcpt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function createRazorpayOrder(amount: number, currency: string, receipt: string, notes: Record<string, string>) {
  const authStr = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authStr}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt,
      notes,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Razorpay error: ${err}`);
  }

  return await res.json();
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { event_id, amount, currency = "INR", entity_type = "event_booking" } = await req.json();

    // SERVER-SIDE VALIDATION
    if (!event_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid event_id or amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["event_booking", "membership", "service"].includes(entity_type)) {
      return new Response(JSON.stringify({ error: "Invalid entity type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the event exists and is paid
    const { data: event, error: eventError } = await supabase
      .from("live_events")
      .select("id, creator_user_id, creator_username, title, price, price_type, status")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify amount matches what's on the server
    const serverAmount = Number(event.price);
    if (Math.abs(serverAmount - amount) > 0.01) {
      return new Response(JSON.stringify({ error: "Amount mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has a pending booking for this event
    const { data: existingBooking } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("event_id", event_id)
      .eq("user_id", user.id)
      .in("status", ["pending", "paid"])
      .maybeSingle();

    if (existingBooking) {
      return new Response(
        JSON.stringify({ error: "You already have a booking for this event" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Razorpay order
    const receipt = generateReceiptId();
    const razorpayOrder = await createRazorpayOrder(amount, currency, receipt, {
      event_id,
      user_id: user.id,
      creator_user_id: event.creator_user_id,
      entity_type,
    });

    // Create pending booking
    const { error: bookingError } = await supabase.from("bookings").insert({
      event_id,
      user_id: user.id,
      creator_user_id: event.creator_user_id,
      amount,
      currency,
      status: "pending",
      razorpay_order_id: razorpayOrder.id,
    });

    if (bookingError) {
      console.error("Booking insert error:", bookingError);
      return new Response(
        JSON.stringify({ error: "Failed to create booking" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create payment record
    await supabase.from("payments").insert({
      user_id: user.id,
      creator_user_id: event.creator_user_id,
      amount,
      currency,
      razorpay_order_id: razorpayOrder.id,
      status: "pending",
      entity_type,
      entity_id: event_id,
    });

    return new Response(
      JSON.stringify({
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: RAZORPAY_KEY_ID,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-razorpay-order error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
