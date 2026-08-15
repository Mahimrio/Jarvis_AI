import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
  resolve: {
    // prevent thinking-orbs from pulling a second React copy (and dedupe three for jsm loaders)
    dedupe: ['react', 'react-dom', 'three'],
  },
  server: {
    // packaged builds land in release/ — keep the dev watcher out of them
    watch: { ignored: ['**/release/**', '**/.tmp-*/**'] },
  },
  optimizeDeps: {
    include: ['thinking-orbs', 'react', 'react-dom'],
  },
})
