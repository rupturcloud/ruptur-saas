import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Redireciona todas as chamadas /api/* para o gateway Node (porta 3001)
      '/api': {
        target: process.env.API_BASE_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: '../../dist-client', // Build separado para não conflitar com outros dists
  }
})
