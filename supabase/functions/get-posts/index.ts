import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("username");
    const creatorUserId = url.searchParams.get("creator_user_id");
    const includeUnpublished = url.searchParams.get("include_drafts") === "true";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
    const offset = (page - 1) * limit;

    if (!username && !creatorUserId) {
      return new Response(
        JSON.stringify({ error: "username or creator_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    // Determine if viewer is the creator (for draft access)
    let viewerId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        if (user) viewerId = user.id;
      } catch {
        // not authenticated, continue as public
      }
    }

    // Build query
    let query = supabase
      .from("posts")
      .select("id, creator_user_id, creator_username, title, caption, content_type, media_url, media_thumbnail, post_type, price, currency, is_published, likes_count, unlocks_count, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (username) {
      query = query.eq("creator_username", username);
    } else if (creatorUserId) {
      query = query.eq("creator_user_id", creatorUserId);
    }

    // Only show published posts to non-creators
    if (!includeUnpublished || viewerId !== creatorUserId) {
      query = query.eq("is_published", true);
    }

    const { data: posts, error, count } = await query;

    if (error) {
      console.error("get-posts error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch posts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If viewer is authenticated, check which paid posts they've unlocked
    let unlockedPostIds: Set<string> = new Set();
    if (viewerId && posts && posts.length > 0) {
      const paidPostIds = posts.filter((p: any) => p.post_type === "paid").map((p: any) => p.id);

      if (paidPostIds.length > 0) {
        const { data: unlocks } = await supabase
          .from("post_unlocks")
          .select("post_id")
          .eq("user_id", viewerId)
          .eq("status", "active")
          .in("post_id", paidPostIds);

        if (unlocks) {
          unlockedPostIds = new Set(unlocks.map((u: any) => u.post_id));
        }
      }
    }

    // Enrich posts with unlock status and strip paid content for non-unlockers
    const enrichedPosts = (posts || []).map((post: any) => {
      const isOwner = viewerId === post.creator_user_id;
      const isUnlocked = unlockedPostIds.has(post.id);

      // Security: never send full media_url for paid posts to non-owners who haven't unlocked
      if (post.post_type === "paid" && !isOwner && !isUnlocked) {
        return {
          ...post,
          media_url: null,
          caption: null,
          is_unlocked: false,
        };
      }

      return { ...post, is_unlocked: isOwner || isUnlocked };
    });

    return new Response(
      JSON.stringify({
        posts: enrichedPosts,
        page,
        limit,
        total: count || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-posts error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
