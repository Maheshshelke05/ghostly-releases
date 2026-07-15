import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: "#c8894a",
        ghostly: {
          50: "#fdf8f3",
          100: "#f7ebdc",
          200: "#f0e6da",
          300: "#e3c9a6",
          400: "#d9a877",
          500: "#c8894a",
          600: "#b27838",
          700: "#96602c",
          800: "#794c24",
          900: "#5f3c1e",
          950: "#2e1c0e",
        },
        dark: {
          50: "#fafaf9",
          100: "#f5f5f4",
          200: "#e7e5e4",
          300: "#d6d3d1",
          400: "#a8a29e",
          500: "#78716c",
          600: "#57534e",
          700: "#44403c",
          800: "#292524",
          850: "#231f1c",
          900: "#1c1917",
          950: "#0c0a09",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backdropBlur: {
        xl: "24px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
      },
      keyframes: {
        glow: {
          "0%": {
            boxShadow:
              "0 0 5px rgba(200, 137, 74, 0.3), 0 0 10px rgba(200, 137, 74, 0.1)",
          },
          "100%": {
            boxShadow:
              "0 0 20px rgba(200, 137, 74, 0.5), 0 0 40px rgba(200, 137, 74, 0.2)",
          },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
