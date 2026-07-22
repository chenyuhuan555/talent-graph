import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 深森林绿强调色
        forest: {
          50: '#F0F7F3',
          100: '#DBEDE3',
          200: '#B7DCC8',
          300: '#8FC6A8',
          400: '#5FA888',
          500: '#3D8A68',
          600: '#2D6A4F',
          700: '#245540',
          800: '#1D4434',
          900: '#163327',
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
