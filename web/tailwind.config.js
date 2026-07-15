export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#16161e',
        surface: '#1f1f2e',
        surface2: '#262838',
        border: '#2e3046',
        'border-lt': '#3a3d52',
        fg: '#c8d3f5',
        'fg-dim': '#a5b0d8',
        muted: '#6b7394',
        amber: '#e0af68',
        'amber-br': '#e4b86d',
        green: '#9ece6a',
        coral: '#f7768e',
        blue: '#7aa2f7',
      },
      fontFamily: {
        mono: ['ui-monospace', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};