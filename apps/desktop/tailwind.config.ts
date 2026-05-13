import type { Config } from "tailwindcss";

/**
 * Stockhausen design tokens.
 * See docs/UI_DESIGN.md for the visual language.
 *
 * Convention: tokens are duplicated as CSS variables in src/styles/tokens.css
 * so non-Tailwind code (Framer Motion, dynamic styles) can read them.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: {
          900: "#06080F",
          800: "#0B0F1C",
          700: "#121830",
          600: "#1B2240",
          500: "#27305B",
        },
        neon: {
          magenta: "#FF2E88",
          cyan: "#00E5FF",
          violet: "#A45BFF",
          amber: "#FFB840",
          emerald: "#28F0A0",
          danger: "#FF4E4E",
        },
        score: {
          parchment: "#F4ECD8",
          ink: "#0F1322",
          grid: "#D9CFB8",
          "night-bg": "#0B0F1C",
          "night-ink": "#E9ECF6",
        },
      },
      fontFamily: {
        sans: [
          "Geist",
          "Inter Display",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["Cormorant Garamond", "ui-serif", "Georgia", "serif"],
      },
      fontFeatureSettings: {
        tabular: '"tnum", "lnum"',
      },
      backdropBlur: {
        glass: "20px",
      },
      transitionTimingFunction: {
        // Apple-style ease curve from docs/UI_DESIGN.md §4
        signature: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      animation: {
        "agent-thinking": "agent-thinking 12s linear infinite",
        "marquee-shimmer": "marquee-shimmer 6s linear infinite",
        "north-star-pulse": "north-star-pulse 3.2s ease-in-out infinite",
      },
      keyframes: {
        "agent-thinking": {
          "0%, 100%": {
            backgroundPosition: "0% 50%",
          },
          "50%": {
            backgroundPosition: "100% 50%",
          },
        },
        "marquee-shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "north-star-pulse": {
          "0%, 100%": {
            opacity: "0.85",
            filter: "drop-shadow(0 0 12px rgba(255, 46, 136, 0.5))",
          },
          "50%": {
            opacity: "1",
            filter: "drop-shadow(0 0 28px rgba(255, 46, 136, 0.85))",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
