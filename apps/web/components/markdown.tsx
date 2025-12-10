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
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ node, className, ...props }) => (
            <p
              {...props}
              className={`mb-3 last:mb-0 ${className || ""}`}
            />
          ),

          // 🔹 UL: listas con bullets
          ul: ({ node, className, ...props }) => (
            <ul
              {...props}
              className={`list-disc pl-5 mb-3 space-y-1 ${className || ""}`}
            />
          ),

          // 🔹 OL: listas numeradas
          ol: ({ node, className, ...props }) => (
            <ol
              {...props}
              className={`list-decimal pl-5 mb-3 space-y-1 ${className || ""}`}
            />
          ),

          // 🔹 LI: leve indentación adicional si querés
          li: ({ node, className, ...props }) => (
            <li
              {...props}
              className={`ml-1 ${className || ""}`}
            />
          ),
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
