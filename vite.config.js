import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  plugins: [react()],
  // The public folder holds the original PNGs. Only import the optimized match assets.
  publicDir: false,
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom/client'], three: ['three'] } },
    },
  },
})
