import type { Config } from "tailwindcss";

/**
 * Ember · Floodlit Clay design tokens.
 * Night stadium (floodlit dark sections) + soft clay (bright, rounded, tactile sections), Ember orange throughout.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ember: {
          50: "#FFF4EC",
          100: "#FFE6D6",
          200: "#FFCBAE",
          300: "#FFA778",
          400: "#FF7A3D",
          500: "#FC5200",
          600: "#DD4700",
          /* Ember with white text, 4.7:1 (the marketing orange above is 4.2:1 and is only used for large text) */
          650: "#D14000",
          700: "#B53A00",
          800: "#7A2700",
        },
        /* Night stadium */
        stadium: {
          950: "#060A14",
          900: "#0A0F1C",
          800: "#121A2E",
          700: "#1C2640",
          600: "#2B3757",
          400: "#7D88A6",
          300: "#A9B2CB",
          beam: "#FFE9D2",
        },
        /* Soft clay surfaces and text */
        clay: {
          ink: "#231C35",
          muted: "#6B6383",
          subtle: "#736B89",
          line: "#ECE6F1",
          canvas: "#FBF8F4",
          peach: "#FFF3EA",
          lavender: "#F4F0FF",
        },
        lilac: { 100: "#EEE9FE", 300: "#C4B5FD", 500: "#8B6CF6", 700: "#5B3FD1" },
        mint: { 100: "#DDF5EA", 300: "#9EE0C3", 500: "#3FB68B", 700: "#1F7A58" },
        status: {
          "active-bg": "#DDF5EA",
          "active-fg": "#1F7A58",
          "pending-bg": "#FFF1D6",
          "pending-fg": "#8A5A12",
          "frozen-bg": "#E3EEFC",
          "frozen-fg": "#2259A0",
          "expired-bg": "#EFECF3",
          "expired-fg": "#5E5873",
          "danger-bg": "#FDE7E4",
          "danger-fg": "#A3271C",
        },
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', "Impact", "Arial Narrow", "sans-serif"],
        sans: ["Outfit", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      fontSize: {
        "hero": ["clamp(2.9rem, 6.6vw, 5.75rem)", { lineHeight: "0.98", letterSpacing: "-0.035em" }],
        "h2": ["clamp(2.25rem, 4.4vw, 3.75rem)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "h3": ["clamp(1.6rem, 2.6vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        clay: "1.75rem",
        "clay-sm": "1.25rem",
      },
      maxWidth: {
        page: "76rem",
        prose: "38rem",
      },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        "pulse-dot": {
          "0%": { boxShadow: "0 0 0 0 rgba(252,82,0,0.5)" },
          "70%": { boxShadow: "0 0 0 10px rgba(252,82,0,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(252,82,0,0)" },
        },
        marquee: { to: { transform: "translateX(-50%)" } },
        sweep: { "0%,100%": { transform: "rotate(-7deg)" }, "50%": { transform: "rotate(7deg)" } },
        drift: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(-40px,30px) scale(1.06)" },
          "66%": { transform: "translate(30px,-20px) scale(0.96)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 8s ease-in-out infinite",
        "pulse-dot": "pulse-dot 2s ease-out infinite",
        marquee: "marquee 42s linear infinite",
        sweep: "sweep 9s ease-in-out infinite",
        drift: "drift 18s ease-in-out infinite",
        "drift-slow": "drift 26s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
