import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the API runs on :5000; Vite proxies /api and /uploads so the browser
// talks to a single origin and no secrets or API hosts are hard-coded in the client.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: process.env.VITE_API_PROXY || 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
