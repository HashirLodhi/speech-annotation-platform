/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { 950: '#07090f', 900: '#0b0f17', 800: '#111824', 700: '#182131', 600: '#222d41', 500: '#33415a' },
        accent: { DEFAULT: '#2dd4bf', soft: '#2dd4bf22', strong: '#14b8a6' },
      },
    },
  },
  plugins: [],
};
