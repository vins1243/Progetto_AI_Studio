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
        geminiDark: '#0f111a',
        geminiDarkSecondary: '#171a26',
        geminiHover: '#222638',
        geminiBorder: '#2a2f45',
        algorIndigo: '#5b5bf7',
        algorTeal: '#14b8a6',
      }
    },
  },
  plugins: [],
}
