/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // In dev, the token comes from backend/.env; it stays on the Vite server side (never in the bundle).
  const backendDir = fileURLToPath(new URL('../backend', import.meta.url))
  const { API_TOKEN } = loadEnv(mode, backendDir, '')

  return {
    plugins: [react()],
    test: { environment: 'jsdom' },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          headers: { authorization: `Bearer ${API_TOKEN ?? ''}` },
        },
      },
    },
  }
})
