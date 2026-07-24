import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 领域主题色：通过 CSS 变量运行时切换（默认 AI 森林绿，见 globals.css :root）
        forest: {
          50: 'var(--theme-50)',
          100: 'var(--theme-100)',
          200: 'var(--theme-200)',
          300: 'var(--theme-300)',
          400: 'var(--theme-400)',
          500: 'var(--theme-500)',
          600: 'var(--theme-600)',
          700: 'var(--theme-700)',
          800: 'var(--theme-800)',
          900: 'var(--theme-900)',
        },
        // 暖灰背景
        warm: {
          50: '#FBFAF8',
          100: '#F5F4F1',
          200: '#EAE8E3',
          300: '#D8D5CD',
          400: '#B8B4A9',
          500: '#8C887E',
          600: '#6B685F',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
        card: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [],
}
export default config
