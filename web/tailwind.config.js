/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // forest-charcoal palette: deep evergreen surfaces, never pitch-black
        ink: {
          900: '#0A1310',  // page bg
          850: '#0F1A16',  // surface
          800: '#13211C',  // elevated surface
          700: '#1A2A22',  // hover surface
          600: '#243B30',  // borders
          500: '#345448',
          400: '#7C8E84',  // muted text
          300: '#A6B5AC',
          200: '#CCD6CE',
          100: '#ECF1ED',  // primary text
        },
        // soft emerald-mint accent (was 'gold' — kept name to avoid breakage)
        gold: {
          DEFAULT: '#7CC295',
          50:      '#E6F5EC',
          100:     '#C7E8D4',
          300:     '#9CD5B2',
          500:     '#7CC295',
          700:     '#3F8A5E',
        },
        emerald2: {
          DEFAULT: '#7CC295',
          deep:    '#3F8A5E',
        },
      },
      fontFamily: {
        display: ['Manrope', 'system-ui', 'sans-serif'],
        body:    ['Inter',   'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        marker:  ['"Permanent Marker"', '"Caveat"', 'cursive'],
      },
      letterSpacing: {
        ultra: '0.32em',
      },
      borderRadius: {
        sharp: '4px',
      },
    },
  },
  plugins: [],
};
