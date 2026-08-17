/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        geminiDark: '#131314',
        geminiDarkSecondary: '#1e1f20',
        geminiHover: '#282a2c',
        geminiBorder: '#37393b',
      }
    },
  },
  plugins: [],
}
