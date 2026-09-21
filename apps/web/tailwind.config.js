/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1A6BD1', dark: '#1557A8', soft: '#E8F1FC' },
        ink: { DEFAULT: '#1F2937', muted: '#6B7280', faint: '#9CA3AF' },
        line: '#E5E7EB',
        canvas: '#F7F8FA',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
