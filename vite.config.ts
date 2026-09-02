import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 4721,
    host: true,
  },
  preview: {
    port: 4721,
    host: true,
  },
})
