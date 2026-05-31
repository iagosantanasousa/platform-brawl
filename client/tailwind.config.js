/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        fighter: '#4a90d9',
        runner: '#27ae60',
        tank: '#e74c3c',
      },
    },
  },
  plugins: [],
};
