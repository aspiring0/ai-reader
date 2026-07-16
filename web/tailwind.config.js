export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
     colors: {
        bg: '#0d0f17',
        surface: '#161a24',
        surface2: '#1d2230',
        surface3: '#252b3c',
        border: '#242938',
        'border-lt': '#363c52',
        fg: '#e2e8f0',
        'fg-dim': '#b8c2d8',
        muted: '#7d8aa8',
        amber: '#e0af68',
        'amber-br': '#e4b86d',
        green: '#9ece6a',
        coral: '#f7768e',
        blue: '#7aa2f7',
        purple: '#bb9af7',
        teal: '#7dcfff',
      },
      fontFamily: {
        mono: ['ui-monospace', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
