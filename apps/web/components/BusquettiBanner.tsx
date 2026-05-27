// apps/web/components/BusquettiBanner.tsx
"use client";

import { useEffect, useState } from "react";

export default function BusquettiBanner() {
  const videoId = "YUS6aOamDI8";
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <iframe
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0&modestbranding=1`}
      allow="autoplay; encrypted-media"
      allowFullScreen
      className={`w-full ${isPortrait ? "aspect-[4/5]" : "aspect-video"}`}
    />
  );
}