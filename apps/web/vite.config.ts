import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/register': backend,
      '/login': backend,
      '/refresh': backend,
      '/me': backend,
      '/documents': backend,
      '/share-links': backend,
      '/ws': { target: backend.replace('http', 'ws'), ws: true },
    },
  },
})
