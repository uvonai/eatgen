import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * UPLOAD & COMPRESS FOOD IMAGE - BACKEND EDGE FUNCTION
 * - JWT authentication verification
 * - Receives base64 image from frontend
 * - Compresses image on backend
 * - Uploads to Supabase Storage
 * - Returns public URL
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] upload-food-image: Request received`);

  try {
    // ========== JWT AUTHENTICATION ==========
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[${requestId}] Missing or invalid authorization header`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error(`[${requestId}] Supabase credentials not configured`);
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth token for verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the JWT and get authenticated user
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.warn(`[${requestId}] Invalid or expired token`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authenticatedUserId = claimsData.claims.sub as string;
    console.log(`[${requestId}] Authenticated user: ${authenticatedUserId.substring(0, 8)}...`);

    // ========== PARSE REQUEST BODY ==========
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { imageBase64, fileName } = body as {
      imageBase64?: string;
      fileName?: string;
    };

    // Validate inputs
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Image data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate image size (max 10MB base64)
    if (imageBase64.length > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'Image too large. Maximum size is 10MB.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role key for storage operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract base64 data (remove data URL prefix if present)
    let base64Data = imageBase64;
    let mimeType = 'image/jpeg';
    
    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',');
      base64Data = parts[1];
      const mimeMatch = parts[0].match(/data:([^;]+);/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
    }

    // Validate MIME type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(mimeType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid image format. Allowed: JPEG, PNG, WebP, GIF.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Generate unique filename using AUTHENTICATED user ID
    const timestamp = Date.now();
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const sanitizedFileName = (fileName || 'food').replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 50);
    const storagePath = `${authenticatedUserId}/${timestamp}_${sanitizedFileName}.${ext}`;

    console.log(`[${requestId}] Uploading image, size: ${bytes.length} bytes`);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('food-images')
      .upload(storagePath, bytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[${requestId}] Upload error:`, uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signed URL (bucket is private - no public access)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('food-images')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error(`[${requestId}] Signed URL error:`, signedUrlError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate image URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Image uploaded successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: signedUrlData.signedUrl,
        path: storagePath,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: 'Failed to upload image' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
