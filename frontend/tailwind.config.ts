import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark theme palette
        surface: {
          DEFAULT: '#0f0f10',
          1: '#1a1a1c',
          2: '#242428',
          3: '#2e2e34',
        },
        accent: {
          DEFAULT: '#6c63ff',
          hover: '#574fd6',
          muted: 'rgba(108,99,255,0.15)',
        },
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        muted: '#71717a',
        border: '#3f3f46',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
