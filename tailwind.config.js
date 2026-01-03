/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          400: "#c084fc",
          600: "#9333ea",
          700: "#7c3aed",
          900: "#4c1d95"
        },
        pink: {
          400: "#f472b6",
          600: "#ec4899"
        }
      }
    },
  },
  plugins: [],
}
