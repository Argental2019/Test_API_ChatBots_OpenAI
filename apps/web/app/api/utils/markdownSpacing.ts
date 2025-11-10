// utils/markdownSpacing.ts
export function enforceSectionSpacing(md: string) {
  if (!md) return md;

  // Asegura línea en blanco después de subtítulos que terminan en ":" (con o sin **)
  md = md.replace(
    /(^|\n)\s*(\*\*[^*\n]+?\*\*|[^\n:]+):\s*\n(?!\n|- |\d+\. |\*)/g,
    (_m, g1, g2) => `${g1}${g2}:\n\n`
  );

  // Asegura línea en blanco tras encabezados de sección "**N. Título**"
  md = md.replace(
    /(^|\n)\*\*\s*\d+\.\s[^*]+?\*\*\s*\n(?!\n)/g,
    (m) => m + "\n"
  );

  // Asegura línea en blanco entre bloques p/ul/ol si quedaron pegados
  md = md.replace(/(\n[^\n-*\d].+)\n(- |\d+\. |\* )/g, (_m, a, b) => `${a}\n\n${b}`);

  return md;
}
