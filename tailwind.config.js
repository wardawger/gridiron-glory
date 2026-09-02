/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Bebas Neue', 'Impact', 'sans-serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        field: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        turf: {
          50:  '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#adb5bd',
          600: '#6c757d',
          700: '#495057',
          800: '#343a40',
          900: '#212529',
          950: '#0d1117',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'pick-flash': 'pickFlash 0.6s ease-out',
        'radar-in': 'radarIn 0.4s ease-out',
        'content-fade-in': 'contentFadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'content-fade-out': 'contentFadeOut 120ms ease-in',
        'sheet-up': 'sheetUp 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-down': 'sheetDown 200ms ease-in',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Uses the standalone `translate` property rather than `transform`.
        // A transform keyframe replaces the element's whole transform for the
        // duration, which silently wipes out Tailwind transform utilities —
        // a menu centered with -translate-x-1/2 would animate in off to one
        // side and only snap to center once the animation finished.
        // `translate` composes with `transform` instead of replacing it.
        slideUp: {
          '0%': { translate: '0 12px', opacity: '0' },
          '100%': { translate: '0 0', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pickFlash: {
          '0%': { backgroundColor: '#bbf7d0' },
          '100%': { backgroundColor: 'transparent' },
        },
        radarIn: {
          '0%':   { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        contentFadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        contentFadeOut: {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0' },
        },
        sheetUp: {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        sheetDown: {
          '0%':   { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
};
