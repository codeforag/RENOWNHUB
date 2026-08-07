/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#15111F',
        bgAlt: '#1E1830',
        bgSoft: '#251E38',
        gold: '#F0B429',
        coral: '#FF6B5B',
        cream: '#F7F3ED',
        muted: '#9C93AE',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Manrope"', 'sans-serif'],
        mono: ['"Space Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 80px -20px rgba(240, 180, 41, 0.45)',
        glowCoral: '0 0 80px -20px rgba(255, 107, 91, 0.45)',
      },
    },
  },
  plugins: [],
}
