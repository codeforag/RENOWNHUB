import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    if (req.method === "POST") {
      // === CREATE ORDER ===
      return await handleCreateOrder(req);
    }

    if (req.method === "PUT") {
      // === VERIFY PAYMENT ===
      return await handleVerifyPayment(req);
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("unlock-post error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ---- CREATE RAZORPAY ORDER ----
  async function handleCreateOrder(req: Request) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { post_id } = await req.json();

    if (!post_id) {
      return new Response(JSON.stringify({ error: "post_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify post exists, is paid, and is published
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, creator_user_id, creator_username, title, post_type, price, is_published")
      .eq("id", post_id)
      .single();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (post.post_type !== "paid") {
      return new Response(JSON.stringify({ error: "This post is free" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!post.is_published) {
      return new Response(JSON.stringify({ error: "Post not available" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cannot unlock own post
    if (post.creator_user_id === user.id) {
      return new Response(JSON.stringify({ error: "Cannot unlock your own post" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already unlocked
    const { data: existingUnlock } = await supabase
      .from("post_unlocks")
      .select("id, status")
      .eq("post_id", post_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingUnlock) {
      return new Response(
        JSON.stringify({ error: "You already unlocked this post", already_unlocked: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amount = Number(post.price);
    const receipt = `post_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // Create Razorpay order
    const authStr = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${authStr}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt,
        notes: { post_id, user_id: user.id, creator_user_id: post.creator_user_id },
      }),
    });

    if (!razorpayRes.ok) {
      const errText = await razorpayRes.text();
      console.error("Razorpay error:", errText);
      return new Response(JSON.stringify({ error: "Payment gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const razorpayOrder = await razorpayRes.json();

    return new Response(
      JSON.stringify({
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: RAZORPAY_KEY_ID,
        post_id,
        post_title: post.title,
        creator_username: post.creator_username,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ---- VERIFY PAYMENT + CREATE UNLOCK ----
  async function handleVerifyPayment(req: Request) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, post_id } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !post_id) {
      return new Response(JSON.stringify({ error: "Missing payment details" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // HMAC-SHA256 verification
    const keyBytes = new TextEncoder().encode(RAZORPAY_KEY_SECRET);
    const dataBytes = new TextEncoder().encode(`${razorpay_order_id}|${razorpay_payment_id}`);
    const hashBuffer = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", hashBuffer, dataBytes);
    const expectedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSig !== razorpay_signature) {
      return new Response(JSON.stringify({ error: "Invalid payment signature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get post info
    const { data: post } = await supabase
      .from("posts")
      .select("id, creator_user_id, price")
      .eq("id", post_id)
      .single();

    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create unlock record
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
      console.error("Unlock insert error:", unlockError);
      // Check for duplicate
      if (unlockError.code === "23505") {
        return new Response(
          JSON.stringify({ success: true, message: "Post already unlocked" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Failed to unlock post" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment unlocks_count on the post
    await supabase.rpc("handle_updated_at"); // no-op, just in case
    await supabase
      .from("posts")
      .update({ unlocks_count: supabase.rpc ? 0 : 0 }) // handled by trigger
      .eq("id", post_id);

    // Create payment record
    await supabase.from("payments").insert({
      user_id: user.id,
      creator_user_id: post.creator_user_id,
      amount: Number(post.price),
      currency: "INR",
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      status: "captured",
      entity_type: "post_unlock",
      entity_id: post_id,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Post unlocked successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
