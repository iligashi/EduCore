/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        background: "hsl(210 33% 98%)",
        foreground: "hsl(220 26% 14%)",
        muted: "hsl(210 24% 94%)",
        primary: "hsl(184 70% 32%)",
        primaryForeground: "hsl(0 0% 100%)",
        accent: "hsl(38 92% 56%)",
        success: "hsl(142 56% 36%)",
        danger: "hsl(0 72% 52%)"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

