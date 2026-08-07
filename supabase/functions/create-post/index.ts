import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user is a creator
    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("user_id, username")
      .eq("user_id", user.id)
      .single();

    if (creatorError || !creator) {
      return new Response(JSON.stringify({ error: "Creator profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse form data (supports file uploads)
    const formData = await req.formData();
    const caption = formData.get("caption") as string || "";
    const title = formData.get("title") as string || "";
    const contentType = (formData.get("content_type") as string) || "image";
    const postType = (formData.get("post_type") as string) || "free";
    const priceStr = (formData.get("price") as string) || "0";
    const file = formData.get("file") as File | null;

    // SERVER-SIDE VALIDATION
    if (!caption && !file) {
      return new Response(
        JSON.stringify({ error: "Caption or image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["image", "video", "text"].includes(contentType)) {
      return new Response(
        JSON.stringify({ error: "Invalid content type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["free", "paid"].includes(postType)) {
      return new Response(
        JSON.stringify({ error: "Invalid post type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const price = parseFloat(priceStr);
    if (postType === "paid" && (isNaN(price) || price <= 0)) {
      return new Response(
        JSON.stringify({ error: "Paid posts must have a valid price" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (postType === "paid") {
      if (price < 1 || price > 10000) {
        return new Response(
          JSON.stringify({ error: "Price must be between 1 and 10000" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate file if present
    if (file) {
      const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const allowedVideoTypes = ["video/mp4", "video/webm"];
      const allowedTypes = contentType === "video" ? allowedVideoTypes : allowedImageTypes;

      if (!allowedTypes.includes(file.type)) {
        return new Response(
          JSON.stringify({ error: `Invalid file type. Allowed: ${allowedTypes.join(", ")}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const maxSize = contentType === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return new Response(
          JSON.stringify({ error: `File too large. Max ${maxSize / 1024 / 1024}MB` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let mediaUrl: string | null = null;
    let mediaThumbnail: string | null = null;

    // Upload file to Supabase Storage
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const storagePath = `posts/${creator.username}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("creator-media")
        .upload(storagePath, file, {
          cacheControl: "31536000",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        return new Response(
          JSON.stringify({ error: "Failed to upload file" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: urlData } = supabase.storage
        .from("creator-media")
        .getPublicUrl(storagePath);

      mediaUrl = urlData.publicUrl;
    }

    // Create the post
    const { data: post, error: postError } = await supabase.from("posts").insert({
      creator_user_id: user.id,
      creator_username: creator.username,
      title: title || null,
      caption,
      content_type: contentType,
      media_url: mediaUrl,
      media_thumbnail: mediaThumbnail,
      post_type: postType,
      price: postType === "paid" ? price : 0,
      is_published: true,
    }).select("id, title, caption, content_type, media_url, post_type, price, created_at")
      .single();

    if (postError) {
      console.error("Post insert error:", postError);
      return new Response(
        JSON.stringify({ error: "Failed to create post" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, post }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-post error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
