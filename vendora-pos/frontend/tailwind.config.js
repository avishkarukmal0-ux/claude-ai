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
        // Re-skin (2026-10-12): semantic colours split FILL vs TEXT for AA. DEFAULT = fills/icons; `dark` = the
        // text shade (used via text-*-dark across the app) chosen to meet >= 4.5:1 on white; `light` = tint bg.
        success: {
          DEFAULT: '#16A34A', // fills / icons
          light:   '#DCFCE7',
          dark:    '#15803D', // text on white (>= 4.5:1)
        },
        warning: {
          DEFAULT: '#D97706', // fills / icons
          light:   '#FEF3C7',
          dark:    '#B45309', // text on white (>= 4.5:1)
        },
        danger: {
          DEFAULT: '#DC2626', // AA on white for text + fills
          light:   '#FEE2E2',
          dark:    '#B91C1C',
        },
        // Promo/offer highlight ONLY (badges/chips with #000 text) — never text on white.
        highlight: {
          DEFAULT: '#FECE14',
          dark:    '#111827',
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
        // Re-skin (2026-10-12): Poppins display/UI, IBM Plex Mono for labels/SKUs/prices. System fallbacks keep
        // text readable offline / before the webfont swaps in (display=swap).
        sans: ['Poppins', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
