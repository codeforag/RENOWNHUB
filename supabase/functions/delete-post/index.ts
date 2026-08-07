import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, logActivity } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Only DELETE is supported.", code: "method_not_allowed" }), {
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

  const { post_id } = body || {};
  if (!post_id || typeof post_id !== "string") {
    return new Response(JSON.stringify({ error: "post_id is required.", code: "missing_post_id" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- VERIFY POST EXISTS + OWNERSHIP ----
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id, creator_user_id, media_url, media_thumbnail, creator_username")
    .eq("id", post_id)
    .maybeSingle();

  if (postErr) {
    console.error("post lookup error:", postErr);
    return new Response(JSON.stringify({ error: `Failed to look up post: ${postErr.message}.`, code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!post) {
    return new Response(JSON.stringify({ error: "Post not found. It may have already been deleted.", code: "post_not_found" }), {
      status: 404, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (post.creator_user_id !== user.id) {
    return new Response(JSON.stringify({ error: "You can only delete your own posts.", code: "not_owner" }), {
      status: 403, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- DELETE STORAGE FILES (best effort) ----
  const pathsToRemove: string[] = [];
  if (post.media_url && !post.media_url.startsWith("http")) pathsToRemove.push(post.media_url);
  if (post.media_thumbnail && !post.media_thumbnail.startsWith("http") && post.media_thumbnail !== post.media_url) {
    pathsToRemove.push(post.media_thumbnail);
  }
  if (pathsToRemove.length > 0) {
    try {
      await supabase.storage.from("creator-media").remove(pathsToRemove);
    } catch (e) {
      console.warn("storage cleanup failed (non-fatal):", e);
    }
  }

  // ---- DELETE POST (cascade removes post_unlocks) ----
  const { error: deleteErr } = await supabase
    .from("posts")
    .delete()
    .eq("id", post_id);

  if (deleteErr) {
    console.error("delete error:", deleteErr);
    return new Response(JSON.stringify({ error: `Failed to delete post: ${deleteErr.message}. Please try again.`, code: "delete_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  await logActivity(supabase, {
    user_id: user.id,
    action: "post_deleted",
    entity_type: "post",
    entity_id: post_id,
    metadata: { creator_username: post.creator_username },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Post deleted successfully.",
  }), { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
});
