import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#050609',
          900: '#0a0b12',
          850: '#0d0e18',
          800: '#121420',
          750: '#161827',
          700: '#1c1f30',
          600: '#262a3d',
          500: '#333850',
        },
        accent: {
          blue: '#4f8cff',
          violet: '#9b6bff',
          pink: '#ff5fa2',
          cyan: '#34e3ff',
          emerald: '#34e0a1',
          amber: '#ffb454',
        },
        content: {
          DEFAULT: '#e8eaf1',
          muted: '#a3a8ba',
          faint: '#6a7083',
        },
      },
      fontFamily: {
        sans: ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.75rem',
      },
      boxShadow: {
        float: '0 24px 70px -24px rgba(0,0,0,0.75)',
        glass: '0 8px 40px -12px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.06)',
        glow: '0 0 0 1px rgba(155,107,255,0.35), 0 0 40px -6px rgba(155,107,255,0.55)',
        'glow-blue': '0 0 0 1px rgba(79,140,255,0.4), 0 0 34px -6px rgba(79,140,255,0.55)',
        'glow-pink': '0 0 0 1px rgba(255,95,162,0.4), 0 0 34px -6px rgba(255,95,162,0.5)',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(120deg, #4f8cff 0%, #9b6bff 48%, #ff5fa2 100%)',
        'accent-gradient-soft': 'linear-gradient(120deg, rgba(79,140,255,0.18), rgba(155,107,255,0.18), rgba(255,95,162,0.18))',
        'grid-faint': 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'aurora-shift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(4%, -3%, 0) scale(1.08)' },
          '66%': { transform: 'translate3d(-3%, 4%, 0) scale(1.04)' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'rise': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'ping-soft': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '75%, 100%': { transform: 'scale(2.2)', opacity: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        floaty: 'floaty 6s ease-in-out infinite',
        aurora: 'aurora-shift 22s ease-in-out infinite',
        'spin-slow': 'spin-slow 18s linear infinite',
        'glow-pulse': 'glow-pulse 3.5s ease-in-out infinite',
        rise: 'rise 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.5s ease both',
        'ping-soft': 'ping-soft 2.4s cubic-bezier(0,0,0.2,1) infinite',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22,1,0.36,1)',
      },
      maxWidth: {
        content: '1400px',
      },
    },
  },
  plugins: [],
};

export default config;
