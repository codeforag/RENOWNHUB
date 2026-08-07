import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const SIGNED_URL_EXPIRY = 300; // 5 minutes
const THUMBNAIL_SIGNED_URL_EXPIRY = 3600; // 1 hour for thumbnails (they're cheaper to leak)

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Only GET is supported.", code: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return new Response(JSON.stringify({ error: "Server is not fully configured.", code: "server_misconfigured" }), {
      status: 503, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Use service_role to bypass RLS so we can manually control which fields are returned
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const url = new URL(req.url);
  const username = url.searchParams.get("username");
  const creatorUserId = url.searchParams.get("creator_user_id");
  const includeUnpublished = url.searchParams.get("include_drafts") === "true";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  if (!username && !creatorUserId) {
    return new Response(JSON.stringify({ error: "Either 'username' or 'creator_user_id' query parameter is required.", code: "missing_param" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Identify the viewer (if authenticated)
  let viewerId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      const anonClient = createClient(SUPABASE_URL, ANON_KEY);
      const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", "").trim());
      if (user) viewerId = user.id;
    } catch {
      // ignore — continue as anonymous
    }
  }

  // Build query (service_role bypasses RLS)
  let query = supabase
    .from("posts")
    .select("id, creator_user_id, creator_username, title, caption, content_type, media_url, media_thumbnail, post_type, price, currency, is_published, likes_count, unlocks_count, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (username) {
    query = query.eq("creator_username", username);
  } else if (creatorUserId) {
    query = query.eq("creator_user_id", creatorUserId);
  }

  // Show drafts only if the viewer IS this creator
  const isOwner = viewerId && (viewerId === creatorUserId || (username && await isCreatorUsername(supabase, username, viewerId)));
  if (!includeUnpublished || !isOwner) {
    query = query.eq("is_published", true);
  }

  const { data: posts, error, count } = await query;

  if (error) {
    console.error("get-posts query error:", error);
    return new Response(JSON.stringify({ error: `Failed to fetch posts: ${error.message}. Please try again.`, code: "query_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (!posts || posts.length === 0) {
    return new Response(JSON.stringify({
      posts: [],
      page,
      limit,
      total: count || 0,
    }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  }

  // ---- For authenticated viewers, fetch their unlocks on these posts ----
  let unlockedPostIds = new Set<string>();
  if (viewerId) {
    const paidPostIds = posts.filter((p: any) => p.post_type === "paid").map((p: any) => p.id);
    if (paidPostIds.length > 0) {
      const { data: unlocks, error: unlockErr } = await supabase
        .from("post_unlocks")
        .select("post_id")
        .eq("user_id", viewerId)
        .eq("status", "active")
        .in("post_id", paidPostIds);
      if (!unlockErr && unlocks) {
        unlockedPostIds = new Set(unlocks.map((u: any) => u.post_id));
      }
    }
  }

  // ---- Enrich + strip sensitive data ----
  const enriched = await Promise.all(posts.map(async (post: any) => {
    const isPostOwner = viewerId === post.creator_user_id;
    const isUnlocked = unlockedPostIds.has(post.id) || isPostOwner;

    // SECURITY: For paid posts, non-owners who haven't unlocked get NO full media URL.
    // They get only the thumbnail (blurred server-side or browser-side).
    if (post.post_type === "paid" && !isUnlocked) {
      // Return only the thumbnail as a signed URL (short expiry)
      const thumbSignedUrl = post.media_thumbnail
        ? await getSignedUrl(supabase, post.media_thumbnail, THUMBNAIL_SIGNED_URL_EXPIRY)
        : null;

      return {
        id: post.id,
        creator_user_id: post.creator_user_id,
        creator_username: post.creator_username,
        title: post.title,
        caption: post.caption ? truncate(post.caption, 80) : null,  // Teaser only
        content_type: post.content_type,
        media_url: null,                // NEVER expose full media
        media_thumbnail: thumbSignedUrl,
        post_type: post.post_type,
        price: post.price,
        currency: post.currency,
        is_published: post.is_published,
        likes_count: post.likes_count,
        unlocks_count: post.unlocks_count,
        created_at: post.created_at,
        is_unlocked: false,
        is_owner: false,
      };
    }

    // Free posts, or unlocked paid posts, or owner's own posts → full media
    const fullSignedUrl = post.media_url
      ? await getSignedUrl(supabase, post.media_url, SIGNED_URL_EXPIRY)
      : null;

    return {
      id: post.id,
      creator_user_id: post.creator_user_id,
      creator_username: post.creator_username,
      title: post.title,
      caption: post.caption,
      content_type: post.content_type,
      media_url: fullSignedUrl,
      media_thumbnail: fullSignedUrl, // same for unlocked/owner
      post_type: post.post_type,
      price: post.price,
      currency: post.currency,
      is_published: post.is_published,
      likes_count: post.likes_count,
      unlocks_count: post.unlocks_count,
      created_at: post.created_at,
      is_unlocked: true,
      is_owner: isPostOwner,
    };
  }));

  return new Response(JSON.stringify({
    posts: enriched,
    page,
    limit,
    total: count || 0,
  }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
});

async function getSignedUrl(supabase: any, path: string, expiry: number): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from("creator-media").createSignedUrl(path, expiry);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (e) {
    console.warn("signed URL failed:", e);
    return null;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trim() + "…";
}

async function isCreatorUsername(supabase: any, username: string, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("creators")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();
    return data?.user_id === userId;
  } catch {
    return false;
  }
}
