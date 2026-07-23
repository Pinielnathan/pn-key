/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          lime: "#d4e01c",
          limeDark: "#96a812",
          limeDim: "#5c6a0e",
          gold: "#c9a227",
        },
        ink: {
          950: "#08090a",
          900: "#101210",
          800: "#191b18",
          700: "#26291f",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(212, 224, 28, 0.15), 0 8px 30px -8px rgba(212, 224, 28, 0.25)",
        "glow-lg": "0 0 40px -8px rgba(212, 224, 28, 0.35)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.8" },
          "80%, 100%": { transform: "scale(1.6)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        drift: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(24px, -18px) scale(1.06)" },
          "66%": { transform: "translate(-18px, 14px) scale(0.96)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.6s cubic-bezier(0.2, 0.6, 0.4, 1) infinite",
        shimmer: "shimmer 2.4s linear infinite",
        drift: "drift 16s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
