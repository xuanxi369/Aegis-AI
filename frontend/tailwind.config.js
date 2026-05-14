/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'holo-blue': '#3B82F6',
        'holo-pink': '#EC4899',
        'holo-cyan': '#06B2D2',
        'holo-mint': '#10B981',
      },
      borderRadius: {
        '4xl': '2rem',     // 32px
        '5xl': '2.5rem',   // 40px
        '6xl': '3rem',     // 48px
      },
      boxShadow: {
        'glass': '0 25px 50px -12px rgba(0, 0, 0, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
        'glass-hover': '0 30px 60px -12px rgba(0, 0, 0, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.8)',
        'glass-inner': 'inset 0 2px 10px rgba(0, 0, 0, 0.03), inset 0 0 0 1px rgba(255, 255, 255, 0.5)',
      },
      backdropBlur: {
        '4xl': '80px',
      }
    },
  },
  plugins: [],
}
