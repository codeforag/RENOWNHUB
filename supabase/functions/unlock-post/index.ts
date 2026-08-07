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

  try {
    if (req.method === "POST") return await handleCreateOrder(req, origin);
    if (req.method === "PUT") return await handleVerifyPayment(req, origin);
    return new Response(JSON.stringify({ error: "Only POST (create order) or PUT (verify payment) is supported.", code: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("unlock-post error:", msg);
    return new Response(JSON.stringify({ error: `Server error: ${msg}. Please retry; if it persists, contact support with this message.`, code: "internal_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// POST: CREATE RAZORPAY ORDER
// ============================================================
async function handleCreateOrder(req: Request, origin: string | null) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return new Response(JSON.stringify({ error: "Payment gateway is not configured. Please contact support.", code: "razorpay_not_configured" }), {
      status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { user, error: authError } = await requireUser(req, SUPABASE_URL, ANON_KEY);
  if (authError) return authError;

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON.", code: "bad_json" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { post_id } = body || {};
  if (!post_id || typeof post_id !== "string") {
    return new Response(JSON.stringify({ error: "post_id is required.", code: "missing_post_id" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- VERIFY POST EXISTS, IS PAID, IS PUBLISHED ----
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id, creator_user_id, creator_username, title, post_type, price, is_published")
    .eq("id", post_id)
    .maybeSingle();

  if (postErr) {
    console.error("post lookup error:", postErr);
    return new Response(JSON.stringify({ error: `Failed to look up post: ${postErr.message}.`, code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!post) {
    return new Response(JSON.stringify({ error: "Post not found. It may have been deleted.", code: "post_not_found" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (post.post_type !== "paid") {
    return new Response(JSON.stringify({ error: "This post is free — no payment needed.", code: "post_is_free", already_unlocked: true }), {
      status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!post.is_published) {
    return new Response(JSON.stringify({ error: "This post is not available.", code: "post_unavailable" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- CANNOT UNLOCK OWN POST ----
  if (post.creator_user_id === user.id) {
    return new Response(JSON.stringify({ error: "This is your own post — you don't need to unlock it.", code: "own_post", already_unlocked: true }), {
      status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- CHECK IF ALREADY UNLOCKED ----
  const { data: existingUnlock } = await supabase
    .from("post_unlocks")
    .select("id, status")
    .eq("post_id", post_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (existingUnlock) {
    return new Response(JSON.stringify({
      success: true,
      message: "You've already unlocked this post.",
      already_unlocked: true,
    }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }

  // ---- CREATE RAZORPAY ORDER ----
  const amount = Number(post.price);
  if (amount <= 0) {
    return new Response(JSON.stringify({ error: "Post price is invalid. Please contact the creator.", code: "invalid_price" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const receipt = `post_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const authStr = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

  const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${authStr}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt,
      notes: {
        post_id,
        user_id: user.id,
        creator_user_id: post.creator_user_id,
        entity_type: "post_unlock",
      },
    }),
  });

  if (!razorpayRes.ok) {
    const errBody = await razorpayRes.text();
    console.error("Razorpay order create error:", razorpayRes.status, errBody);
    let msg = "Payment gateway error.";
    if (razorpayRes.status === 401) msg = "Payment gateway authentication failed. Please contact support.";
    else if (razorpayRes.status === 429) msg = "Payment gateway rate limit reached. Please try again in a minute.";
    return new Response(JSON.stringify({ error: msg, code: "razorpay_error", gateway_status: razorpayRes.status }), {
      status: 502, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const razorpayOrder = await razorpayRes.json();

  return new Response(JSON.stringify({
    success: true,
    message: "Order created. Complete the payment to unlock this post.",
    order_id: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key: RAZORPAY_KEY_ID,                  // Public key — safe to expose
    post_id,
    post_title: post.title,
    creator_username: post.creator_username,
    already_unlocked: false,
  }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

// ============================================================
// PUT: VERIFY PAYMENT + CREATE UNLOCK
// ============================================================
async function handleVerifyPayment(req: Request, origin: string | null) {
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

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, post_id } = body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !post_id) {
    return new Response(JSON.stringify({ error: "Missing payment details (order_id, payment_id, signature, post_id are all required).", code: "missing_payment_fields" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- HMAC-SHA256 SIGNATURE VERIFICATION ----
  // Razorpay signs `${order_id}|${payment_id}` with the key secret.
  const keyBytes = new TextEncoder().encode(RAZORPAY_KEY_SECRET);
  const dataBytes = new TextEncoder().encode(`${razorpay_order_id}|${razorpay_payment_id}`);
  const hmacKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", hmacKey, dataBytes);
  const expectedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedSig !== razorpay_signature) {
    console.error("Signature mismatch. Expected:", expectedSig.slice(0, 16) + "...", "Got:", razorpay_signature.slice(0, 16) + "...");
    return new Response(JSON.stringify({ error: "Payment signature verification failed. The payment may have been tampered with. If you were charged, please contact support with your order ID.", code: "invalid_signature" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- GET POST INFO ----
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id, creator_user_id, creator_username, title, price")
    .eq("id", post_id)
    .maybeSingle();

  if (postErr || !post) {
    return new Response(JSON.stringify({ error: "Post not found. It may have been deleted.", code: "post_not_found" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- ALREADY UNLOCKED? (idempotent) ----
  const { data: existingUnlock } = await supabase
    .from("post_unlocks")
    .select("id")
    .eq("post_id", post_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (existingUnlock) {
    return new Response(JSON.stringify({ success: true, message: "Post already unlocked.", already_unlocked: true }), {
      status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- INSERT UNLOCK RECORD ----
  const { error: unlockError } = await supabase.from("post_unlocks").insert({
    post_id,
    user_id: user.id,
    creator_user_id: post.creator_user_id,
    amount: Number(post.price),
    currency: "INR",
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    status: "active",
  });

  if (unlockError) {
    console.error("unlock insert error:", unlockError);
    if (unlockError.code === "23505") {
      // unique constraint — already unlocked
      return new Response(JSON.stringify({ success: true, message: "Post already unlocked.", already_unlocked: true }), {
        status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: `Failed to unlock post: ${unlockError.message}. If you were charged, please contact support with order ID ${razorpay_order_id}.`, code: "unlock_insert_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- INCREMENT unlocks_count (atomic RPC) ----
  const { error: incrErr } = await supabase.rpc("increment_unlocks_count", { post_uuid: post_id });
  if (incrErr) {
    console.warn("increment_unlocks_count failed (non-fatal):", incrErr);
  }

  // ---- CREATE PAYMENT RECORD ----
  const { error: payErr } = await supabase.from("payments").insert({
    user_id: user.id,
    creator_user_id: post.creator_user_id,
    amount: Number(post.price),
    currency: "INR",
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    status: "captured",
    entity_type: "post_unlock",     // ✓ now allowed by the CHECK constraint
    entity_id: post_id,
  });
  if (payErr) {
    console.warn("payment insert failed (non-fatal):", payErr);
  }

  await logActivity(supabase, {
    user_id: user.id,
    action: "post_unlocked",
    entity_type: "post",
    entity_id: post_id,
    metadata: { amount: Number(post.price), razorpay_order_id, razorpay_payment_id },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Payment verified and post unlocked. Enjoy the content!",
    already_unlocked: false,
  }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}
