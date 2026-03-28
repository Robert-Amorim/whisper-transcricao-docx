import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#2b8cee",
        "primary-strong": "#1a70c5",
        "background-light": "#f6f7f8",
        "background-dark": "#111418",
        "surface-dark": "#1c2127",
        "text-main": "#111418",
        "text-muted": "#637588",
        clarity: {
          canvas: "#101922",
          surface: "#182430",
          "surface-strong": "#111b25",
          border: "#2b3a49",
          "border-strong": "#324355",
          text: "#dce8f4",
          "text-muted": "#9ab0c3",
          "text-soft": "#bfd0e2",
          accent: "#2b8cee",
          "accent-strong": "#1a70c5"
        }
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"]
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px"
      }
    }
  },
  plugins: [forms, containerQueries]
};

export default config;
