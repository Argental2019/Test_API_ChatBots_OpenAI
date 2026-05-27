// apps/web/components/BusquettiBanner.tsx
"use client";

import { useEffect, useState } from "react";

export default function BusquettiBanner() {
  const horizontalId = "YUS6aOamDI8";
  const verticalId   = "tW5dgLMJdWc";

  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isPortrait === null) return null;

  const videoId = isPortrait ? verticalId : horizontalId;
  const aspect  = isPortrait ? "aspect-[4/5]" : "aspect-video";

  return (
    <iframe
      key={videoId}
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0&modestbranding=1`}
      allow="autoplay; encrypted-media"
      allowFullScreen
      className={`w-full ${aspect}`}
    />
  );
}