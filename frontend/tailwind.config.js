/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F6F0",
        surface: "#FFFFFF",
        line: "#E5E1D6",
        ink: {
          DEFAULT: "#12201B",
          soft: "#3F4B43",
          muted: "#7C7768",
        },
        brand: {
          50: "#EEF6F1",
          100: "#D6ECE0",
          200: "#AEDAC2",
          300: "#7FC29F",
          400: "#52A67D",
          500: "#358763",
          600: "#256B4C",
          700: "#1F5940",
          800: "#17432F",
          900: "#123526",
        },
        accent: {
          50: "#FDF6E8",
          100: "#FAEAC4",
          200: "#F3D488",
          300: "#EBBB55",
          400: "#E3A130",
          500: "#C98A1F",
          600: "#A66E18",
          700: "#7D5313",
        },
        signal: {
          50: "#FBEEEB",
          300: "#DE9483",
          400: "#D3705A",
          500: "#C0503D",
          600: "#9C3E2E",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        sans: ['"Plus Jakarta Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(18, 32, 27, 0.04), 0 1px 0 rgba(18, 32, 27, 0.03)",
        lift: "0 12px 24px -12px rgba(18, 32, 27, 0.18)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: 1, transform: "scale(1)" },
          "50%": { opacity: 0.55, transform: "scale(0.85)" },
        },
        "slide-in": {
          "0%": { opacity: 0, transform: "translateY(-6px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "slide-in": "slide-in 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
