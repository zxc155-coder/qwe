/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vibe: {
          bg0:    '#0B0A1A',
          bg1:    '#1A0B2E',
          accent: '#C084FC',
          accent2:'#A855F7',
          glass:  'rgba(255,255,255,0.06)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow:      '0 0 24px rgba(192,132,252,0.45)',
        glowStrong:'0 0 36px rgba(168,85,247,0.65)',
      },
      animation: {
        bubble:  'bubble 6s ease-in-out infinite',
        glitch:  'glitch 3s steps(2) infinite',
        floaty:  'floaty 6s ease-in-out infinite',
      },
      keyframes: {
        bubble: {
          '0%':   { transform: 'translateY(20px) scale(0.8)', opacity: '0' },
          '50%':  { opacity: '1' },
          '100%': { transform: 'translateY(-120px) scale(1.1)', opacity: '0' },
        },
        glitch: {
          '0%,100%': { textShadow: '2px 0 #C084FC, -2px 0 #A855F7' },
          '50%':     { textShadow: '-2px 0 #C084FC, 2px 0 #A855F7' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-6px)' },
        },
      },
      backgroundImage: {
        'vibe-gradient': 'linear-gradient(135deg, #0B0A1A 0%, #1A0B2E 100%)',
      },
    },
  },
  plugins: [],
};
