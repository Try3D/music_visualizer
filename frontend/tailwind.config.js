/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'spotify': {
          'green': '#1DB954',
          'black': '#191414',
          'dark-gray': '#121212',
          'gray': '#282828',
          'light-gray': '#B3B3B3',
          'white': '#FFFFFF'
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' }
        },
        glow: {
          from: { boxShadow: '0 0 20px -10px rgba(29, 185, 84, 0.5)' },
          to: { boxShadow: '0 0 20px -10px rgba(29, 185, 84, 0.8)' }
        }
      }
    },
  },
  plugins: [],
}