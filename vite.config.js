// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 경로 (https://ysmath0246.github.io/points-only/)
  base: '/points-only/',
})
