// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 리포지토리 이름과 동일 (https://ysmath0246.github.io/points-only/)
  base: '/points-only/',
})
