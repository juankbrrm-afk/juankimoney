import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefcf6",
          100: "#d5f7e7",
          200: "#adedd2",
          300: "#79ddb8",
          400: "#43c69a",
          500: "#22ab80",
          600: "#158a67",
          700: "#136e55",
          800: "#135745",
          900: "#12483a",
          950: "#062920",
        },
      },
    },
  },
  plugins: [],
};

export default config;
