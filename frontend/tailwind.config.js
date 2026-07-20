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
    },
  },
  plugins: [],
};
