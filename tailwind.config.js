/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          bg: '#0a0d14',       // глубокий космический фон
          card: '#121824',     // цвет карточек/панелей
          border: '#1f293d',   // тонкие границы приборов
          cyan: '#00f0ff',     // индикаторы нормы / сканера
          amber: '#ffb703',    // предупреждения
          alert: '#ff3366',    // критические алерты
          clay: '#8e9aaf',     // серо-глиняный оттенок для анатомии
        }
      }
    },
  },
  plugins: [],
}