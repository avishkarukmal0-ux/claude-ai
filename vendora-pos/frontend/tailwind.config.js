/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          50:  '#EFF6FF',
          100: '#DBEAFE',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E40AF',
        },
        success: {
          DEFAULT: '#16A34A',
          light:   '#DCFCE7',
          dark:    '#14532D',
        },
        warning: {
          DEFAULT: '#D97706',
          light:   '#FEF3C7',
          dark:    '#78350F',
        },
        danger: {
          DEFAULT: '#DC2626',
          light:   '#FEE2E2',
          dark:    '#7F1D1D',
        },
        'pos-bg':     '#0F172A',
        'pos-panel':  '#1E293B',
        'pos-card':   '#334155',
        'pos-text':   '#F1F5F9',
        'pos-muted':  '#94A3B8',
        'cash-green': '#15803D',
        'cash-bg':    '#F0FDF4',
        'alert-red':  '#B91C1C',
        'bg-primary': 'var(--bg-primary)',
        'bg-card-v2': 'var(--bg-card)',
        'bg-hover-v2': 'var(--bg-hover)',
        'border-v2': 'var(--border)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
