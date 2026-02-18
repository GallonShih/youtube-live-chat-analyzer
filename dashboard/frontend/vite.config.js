import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '../../'),
  server: {
    host: true, // Listen on all addresses
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setupTests.js',
    css: true,
    globals: true,
  },
})
