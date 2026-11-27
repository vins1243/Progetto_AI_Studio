/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        geminiDark: '#120a10',
        geminiDarkSecondary: '#1c1018',
        geminiHover: '#2b1824',
        geminiBorder: '#3e2133',
        algorIndigo: '#9f1239',
        algorTeal: '#a21caf',
        // Palette Bordeaux / Rosso Cremisi (sostituisce i toni indigo in tutta l'app)
        indigo: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e11d48',
          600: '#be123c',
          700: '#9f1239',
          800: '#881337',
          900: '#4c0519',
          950: '#2d0410',
        },
        // Palette Fucsia Scuro / Amaranto (sostituisce i toni blue in tutta l'app)
        blue: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#c026d3',
          600: '#a21caf',
          700: '#86198f',
          800: '#701a75',
          900: '#4a044e',
          950: '#2e0233',
        },
      }
    },
  },
  plugins: [],
}
