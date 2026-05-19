// apps/web/components/BusquettiBanner.tsx
"use client";

export default function BusquettiBanner() {
  const videoId = "YUS6aOamDI8";

  return (
    <iframe
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0&modestbranding=1`}
      allow="autoplay; encrypted-media"
      allowFullScreen
      className="w-full aspect-video"
    />
  );
}