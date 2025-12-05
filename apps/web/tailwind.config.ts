import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./pages/**/*.{ts,tsx,js,jsx,mdx}",   // si usás pages/, si no podés omitir
    "./src/**/*.{ts,tsx,js,jsx,mdx}",     // opcional si tenés cosas en src/
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
