import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        danger: {
          DEFAULT: '#EF4444',
          50: '#FEF2F2',
          600: '#EF4444',
          700: '#DC2626',
        },
        success: {
          DEFAULT: '#22C55E',
          50: '#F0FDF4',
          600: '#22C55E',
        },
        warning: {
          DEFAULT: '#F59E0B',
          50: '#FFFBEB',
          600: '#F59E0B',
        },
        unknown: {
          DEFAULT: '#9CA3AF',
        },
        surface: '#FFFFFF',
        background: '#F9FAFB',
        border: '#E5E7EB',
      },
    },
  },
  plugins: [],
};

export default config;
