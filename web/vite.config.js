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
    // Fail loudly if 5173 is taken instead of quietly moving to 5174. The API
    // allows a fixed list of origins, so a dev server that drifts to another
    // port is not an allowed origin any more: every POST comes back as a bare
    // "403 Invalid CORS request" while GETs still work, which looks like a
    // broken feature rather than a second copy of the dev server still running.
    strictPort: true,
    // Proxy API calls to the Spring Boot backend during development
    proxy: {
      // The API serves everything under /api/v1, so this passes through as-is.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
