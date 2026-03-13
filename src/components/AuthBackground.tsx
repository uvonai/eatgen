import { useLocation } from "react-router-dom";
import authLifestyle1 from "@/assets/auth-lifestyle.jpg";
import authLifestyle2 from "@/assets/auth-lifestyle-2.jpg";
import authLifestyle3 from "@/assets/auth-lifestyle-3.jpg";

/**
 * Auth background: 3 lifestyle photos displayed in vertical columns (side by side)
 * with low opacity and subtle animation.
 */
const AuthBackground = () => {
  const { pathname } = useLocation();
  const isAuthPage = pathname === "/auth";

  if (!isAuthPage) return null;

  const images = [authLifestyle1, authLifestyle2, authLifestyle3];

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Base dark layer */}
      <div className="absolute inset-0 bg-black" />

      {/* 3 images in a row (columns) */}
      <div className="absolute inset-0 flex">
        {images.map((src, index) => (
          <div
            key={index}
            className={`flex-1 h-full overflow-hidden auth-column auth-column-${index + 1}`}
          >
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover auth-column-image"
              loading="eager"
              decoding="sync"
              fetchPriority="high"
            />
          </div>
        ))}
      </div>

      {/* Warm color overlay like reference */}
      <div className="absolute inset-0 auth-warm-overlay" />

      {/* Vignette effect */}
      <div className="absolute inset-0 auth-vignette" />

      {/* Bottom gradient for text readability */}
      <div className="absolute inset-0 auth-bg-overlay" />
    </div>
  );
};

export default AuthBackground;
