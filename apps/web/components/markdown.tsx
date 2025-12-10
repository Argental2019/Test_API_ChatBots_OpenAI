// apps/web/components/markdown.tsx
"use client";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";

type Props = { children: string; className?: string };

// ===============================
//  Funciones auxiliares
// ===============================

function onlyLetters(str: string): string {
  return str.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
}

function isAllCaps(text: string): boolean {
  const letters = onlyLetters(text);
  if (!letters) return false;
  return letters === letters.toUpperCase();
}

function toSentenceCase(text: string): string {
  const lower = text.toLowerCase();
  let done = false;
  return lower.replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, (m) => {
    if (done) return m;
    done = true;
    return m.toUpperCase();
  });
}

/**
 * 🔥 Regla final robusta:
 * - Cualquier línea que empiece con "n. Texto…"
 * - La convertimos en **n. Texto** (negrita)
 * - Si está TODO EN MAYÚSCULAS → además lo pasamos a sentence case
 */
function normalizeNumberedLines(source: string): string {
  const lines = source.split("\n");

  const norm = lines.map((line) => {
    const match = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (!match) return line;

    const [, indent, num, text] = match;
    let cleaned = text.trim();

    // Si está en MAYÚSCULAS → aplicar sentence case
    if (isAllCaps(cleaned)) {
      cleaned = toSentenceCase(cleaned);
    }

    // Poner SIEMPRE en negrita
    return `${indent}**${num}. ${cleaned}**`;
  });

  return norm.join("\n");
}

export default function Markdown({ children, className }: Props) {
  // =============================
  // 🔧 PRE-PROCESADO GLOBAL
  // =============================
  const processed = normalizeNumberedLines(children || "");

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ className: cn, ...props }) => (
            <p {...props} className={`mb-3 last:mb-0 normal-case ${cn || ""}`} />
          ),

          ul: ({ className: cn, ...props }) => (
            <ul {...props} className={`list-disc pl-5 mb-3 space-y-1 normal-case ${cn || ""}`} />
          ),

          ol: ({ className: cn, ...props }) => (
            <ol {...props} className={`list-decimal pl-5 mb-3 space-y-1 normal-case ${cn || ""}`} />
          ),

          li: ({ className: cn, ...props }) => (
            <li {...props} className={`ml-1 normal-case ${cn || ""}`} />
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
