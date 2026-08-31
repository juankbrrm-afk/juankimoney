import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Build del estudio como aplicacion independiente. Un solo bundle, un solo
// CSS, sin trocear: `scripts/inline-studio.mjs` los mete luego en un HTML.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-studio',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: path.resolve(__dirname, 'studio.html'),
      output: { inlineDynamicImports: true },
    },
  },
})
