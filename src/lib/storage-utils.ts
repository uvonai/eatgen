/**
 * Storage utility for generating signed URLs for private bucket images.
 * The food-images bucket is private - images require signed URLs for access.
 */

import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_CACHE = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_DURATION = 60 * 60; // 1 hour

/**
 * Extract the storage path from a Supabase storage URL (public or signed).
 * Returns null if the URL is not a Supabase storage URL.
 */
function extractStoragePath(url: string): string | null {
  try {
    // Match patterns like /storage/v1/object/public/food-images/... or /storage/v1/object/sign/food-images/...
    const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/food-images\/(.+?)(?:\?|$)/);
    if (match) return match[1];

    // Already a plain path (no URL prefix)
    if (!url.startsWith('http') && !url.startsWith('/')) return url;

    return null;
  } catch {
    return null;
  }
}

/**
 * Get a displayable URL for a food image.
 * - If the URL is already a valid signed URL, returns it as-is.
 * - If it's a public URL pattern, generates a signed URL.
 * - Falls back to the original URL if path extraction fails.
 */
export async function getSignedImageUrl(imageUrl: string | null | undefined): Promise<string | null> {
  if (!imageUrl || imageUrl.trim() === '') return null;

  // Check cache first
  const cached = SIGNED_URL_CACHE.get(imageUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // If it's already a signed URL (contains "token="), check if it might be expired
  // For recently created signed URLs, just use them directly
  if (imageUrl.includes('token=') && imageUrl.includes('/sign/')) {
    return imageUrl;
  }

  // Extract path and generate signed URL
  const path = extractStoragePath(imageUrl);
  if (!path) return imageUrl; // Not a storage URL, return as-is

  try {
    const { data, error } = await supabase.storage
      .from('food-images')
      .createSignedUrl(path, SIGNED_URL_DURATION);

    if (error || !data?.signedUrl) {
      console.warn('Failed to generate signed URL:', error?.message);
      return imageUrl; // Fallback to original
    }

    // Cache the signed URL
    SIGNED_URL_CACHE.set(imageUrl, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_DURATION - 60) * 1000, // Refresh 1 min before expiry
    });

    return data.signedUrl;
  } catch (e) {
    console.warn('Signed URL generation error:', e);
    return imageUrl;
  }
}
