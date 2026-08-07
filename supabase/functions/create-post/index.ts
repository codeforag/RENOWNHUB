import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { requireUser, logActivity } from "../_shared/validation.ts";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_CAPTION_LEN = 2000;
const MAX_TITLE_LEN = 200;

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

  const { user, error: authError } = await requireUser(req, SUPABASE_URL, ANON_KEY);
  if (authError) return authError;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---- ROLE VERIFICATION: must be a creator ----
  const { data: creator, error: creatorErr } = await supabase
    .from("creators")
    .select("user_id, username")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creatorErr) {
    console.error("creator lookup error:", creatorErr);
    return new Response(JSON.stringify({ error: "We couldn't verify your creator account. Please try again.", code: "db_error" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!creator) {
    return new Response(JSON.stringify({ error: "Only creator accounts can publish posts. Upgrade your account to creator to continue.", code: "not_creator" }), {
      status: 403, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // ---- PARSE FORM DATA ----
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Form data could not be parsed. Please refresh and try again.", code: "bad_form" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const caption = (formData.get("caption") as string || "").trim();
  const title = (formData.get("title") as string || "").trim();
  const contentType = (formData.get("content_type") as string) || "image";
  const postType = (formData.get("post_type") as string) || "free";
  const priceStr = (formData.get("price") as string) || "0";
  const file = formData.get("file") as File | null;

  // ---- VALIDATION ----
  if (caption.length > MAX_CAPTION_LEN) {
    return new Response(JSON.stringify({ error: `Caption is too long (max ${MAX_CAPTION_LEN} characters; you sent ${caption.length}).`, code: "caption_too_long", field: "caption" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (title.length > MAX_TITLE_LEN) {
    return new Response(JSON.stringify({ error: `Title is too long (max ${MAX_TITLE_LEN} characters).`, code: "title_too_long", field: "title" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!caption && !file) {
    return new Response(JSON.stringify({ error: "Add a caption or upload an image/video to publish a post.", code: "empty_post" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!["image", "video", "text"].includes(contentType)) {
    return new Response(JSON.stringify({ error: `Invalid content type '${contentType}'. Allowed: image, video, text.`, code: "invalid_content_type" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
  if (!["free", "paid"].includes(postType)) {
    return new Response(JSON.stringify({ error: `Invalid post type '${postType}'. Allowed: free, paid.`, code: "invalid_post_type" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let price = 0;
  if (postType === "paid") {
    price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      return new Response(JSON.stringify({ error: "Paid posts must have a valid price greater than 0.", code: "invalid_price", field: "price" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (price < 1 || price > 10000) {
      return new Response(JSON.stringify({ error: `Price must be between ₹1 and ₹10,000 (you entered ₹${price}).`, code: "price_out_of_range", field: "price" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  // ---- FILE VALIDATION ----
  let mediaUrl: string | null = null;
  let mediaThumbnail: string | null = null;
  let mediaPath: string | null = null;
  let thumbPath: string | null = null;

  if (file) {
    if (!file.type) {
      return new Response(JSON.stringify({ error: "File type is missing. Please re-upload the file.", code: "missing_mime", field: "file" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const allowedTypes = contentType === "video" ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: `File type '${file.type}' is not allowed for ${contentType} posts. Allowed: ${allowedTypes.join(", ")}.`, code: "wrong_file_type", field: "file" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const maxSize = contentType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max for ${contentType}: ${maxSize / 1024 / 1024}MB.`, code: "file_too_large", field: "file" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (file.size === 0) {
      return new Response(JSON.stringify({ error: "File appears to be empty. Please re-upload.", code: "empty_file", field: "file" }), {
        status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // ---- UPLOAD TO PRIVATE BUCKET (creator-media) ----
    const ext = (file.name.split(".").pop() || "").toLowerCase() || (contentType === "video" ? "mp4" : "jpg");
    const uuid = crypto.randomUUID();
    mediaPath = `posts/${creator.username}/${uuid}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("creator-media")
      .upload(mediaPath, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: `Failed to upload file: ${uploadError.message}. Please try again.`, code: "upload_failed" }), {
        status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // ---- GENERATE SIGNED URLS (5-minute expiry for creator preview) ----
    const { data: signed } = await supabase.storage
      .from("creator-media")
      .createSignedUrl(mediaPath, 300);

    mediaUrl = signed?.signedUrl || null;
    mediaThumbnail = mediaUrl; // For creator's own post, thumbnail == full media (they paid themselves by creating it)

    // For paid posts, we'll generate a separate low-quality thumbnail by uploading
    // a downscaled version. Since Deno doesn't have native image processing, we'll
    // just use the same media_url with a thumbnail flag and let the frontend blur it.
    // For better protection, the get-posts edge function will only return the thumbnail
    // path for non-unlockers and use signed URLs.
    thumbPath = mediaPath;
  }

  // ---- INSERT POST ----
  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      creator_user_id: user.id,
      creator_username: creator.username,
      title: title || null,
      caption,
      content_type: contentType,
      media_url: mediaPath,        // Store the storage path (not signed URL) — get-posts returns signed URLs
      media_thumbnail: thumbPath,
      post_type: postType,
      price: postType === "paid" ? price : 0,
      is_published: true,
    })
    .select("id, title, caption, content_type, post_type, price, created_at")
    .single();

  if (postError) {
    console.error("post insert error:", postError);
    // Try to cleanup the uploaded file
    if (mediaPath) {
      try { await supabase.storage.from("creator-media").remove([mediaPath]); } catch {}
    }
    return new Response(JSON.stringify({ error: `Failed to create post: ${postError.message}. Please try again.`, code: "insert_failed" }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  await logActivity(supabase, {
    user_id: user.id,
    action: "post_created",
    entity_type: "post",
    entity_id: post.id,
    metadata: { post_type: postType, content_type: contentType, price },
    req,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Post published successfully!",
    post,
  }), {
    status: 201, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
