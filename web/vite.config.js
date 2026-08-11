import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Tailwind 4 is configured entirely in CSS (src/styles/index.css) — there is
  // no tailwind.config.js and no PostCSS pipeline.
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy API calls to the Spring Boot backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
