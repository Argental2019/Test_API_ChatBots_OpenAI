"use client";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";

type Props = { children: string; className?: string };

export default function Markdown({ children, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        // Soporta **negrita**, _itálica_, listas, tablas, checklists, etc.
        remarkPlugins={[remarkGfm, remarkBreaks]}
        // Sanitiza HTML por seguridad
        rehypePlugins={[rehypeSanitize]}
        // Podés personalizar tags si querés (ej: code, links, etc.)
        components={{
          // Mantener saltos de línea agradables
          p: ({node, ...props}) => <p {...props} className="mb-3 last:mb-0" />,
          li: ({node, ...props}) => <li {...props} className="ml-4" />,
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
