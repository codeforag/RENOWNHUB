import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Cloudflare Pages serves from dist/
    outDir: 'dist',
    // Ensure assets use relative paths for Cloudflare
    base: './',
  },
})
