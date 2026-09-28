/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F6F4F1',
        ink: '#1A1A1A',
        muted: '#6B6B6B',
        line: '#E6E2DC',
        kds: {
          bg: '#0F1115',
          surface: '#1A1E26',
        },
        status: {
          pending: '#D97706',
          cooking: '#2563EB',
          ready: '#16A34A',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      minHeight: {
        tap: '44px',
      },
      minWidth: {
        tap: '44px',
      },
    },
  },
  plugins: [],
};
