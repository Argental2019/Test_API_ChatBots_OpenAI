// apps/web/components/AdvisorBanner.tsx
"use client";

import Link from "next/link";

export default function AdvisorBanner() {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 20,
        background: "var(--navy)",
        boxShadow: "0 18px 40px -24px rgba(27,42,94,.55)",
        marginBottom: 32,
      }}
    >
      {/* Círculo decorativo */}
      <div
        style={{
          position: "absolute",
          right: -80,
          top: -120,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: "rgba(245,168,0,.09)",
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8, minHeight: 280 }}>
        {/* Imagen persona */}
        <div style={{ width: 230, flex: "0 0 230px", alignSelf: "flex-end", paddingLeft: 18 }}>
          <img
            src="/busquetti/busquetti-persona.png"
            alt="Asesor Busquetti"
            style={{ width: 212, height: 280, display: "block", objectFit: "contain", objectPosition: "bottom" }}
          />
        </div>

        {/* Texto */}
        <div style={{ flex: "1 1 340px", padding: "36px 40px 40px 14px", minWidth: 300 }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--gold)",
              marginBottom: 14,
            }}
          >
            Asesor Integral
          </span>
          <h1
            className="heading-font"
            style={{
              fontWeight: 700,
              fontSize: 38,
              lineHeight: 1.05,
              letterSpacing: "-.025em",
              color: "#fff",
              margin: "0 0 12px",
            }}
          >
            Busquetti — Asesor Integral
          </h1>
          <p
            style={{
              margin: "0 0 24px",
              maxWidth: 520,
              fontSize: 15,
              lineHeight: 1.6,
              color: "rgba(255,255,255,.72)",
            }}
          >
            Contanos qué producción necesitás y en qué espacio trabajás. Busquetti diagnostica tu línea y te recomienda los equipos Argental adecuados.
          </p>
          <Link
            href="/advisor"
            style={{
              display: "inline-block",
              border: "none",
              cursor: "pointer",
              background: "var(--gold)",
              color: "var(--navy)",
              fontSize: 14.5,
              fontWeight: 700,
              padding: "14px 26px",
              borderRadius: 10,
              boxShadow: "0 8px 20px -10px rgba(245,168,0,.8)",
              textDecoration: "none",
            }}
          >
            Consultar al Asesor
          </Link>
        </div>
      </div>
    </div>
  );
}