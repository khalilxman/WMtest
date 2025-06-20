import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // V-- ADD THIS ENTIRE 'safelist' SECTION --V
  safelist: [
    'bg-blue-600',
    'hover:bg-blue-700',
    'bg-green-600',
    'hover:bg-green-700',
    'bg-orange-500',
    'hover:bg-orange-600',
    'grid-cols-2',
    'grid-cols-3',
    'text-xl',
    'text-base'
  ],
  // ^-- END OF SECTION TO ADD --^
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
export default config
