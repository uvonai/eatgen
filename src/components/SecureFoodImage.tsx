import { useState, useEffect } from "react";
import { getSignedImageUrl } from "@/lib/storage-utils";

interface SecureFoodImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Renders a food image from the private storage bucket.
 * Automatically generates signed URLs for private images.
 */
export function SecureFoodImage({ src, alt, className, fallback }: SecureFoodImageProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src || src.trim() === '') {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    getSignedImageUrl(src).then(url => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => { cancelled = true; };
  }, [src]);

  if (!signedUrl || failed) {
    return <>{fallback ?? null}</>;
  }

  return (
    <img
      src={signedUrl}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
