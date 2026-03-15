/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./styles/**/*.{css}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "var(--ink)",
        paper: "var(--paper)",
        accent: "var(--accent)",
        accent2: "var(--accent-2)",
        muted: "var(--muted)",
        border: "var(--border)",
      },
      boxShadow: {
        soft: "0 12px 30px -18px rgba(0,0,0,0.35)",
        lift: "0 25px 60px -30px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
