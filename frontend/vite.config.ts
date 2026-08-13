import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // prevent thinking-orbs from pulling a second React copy
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['thinking-orbs', 'react', 'react-dom'],
  },
})
