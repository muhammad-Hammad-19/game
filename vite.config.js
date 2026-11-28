import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  plugins: [react()],
  // The public folder holds the original PNGs, which are not shipped. `static` holds the
  // files that must keep their names: the web app manifest, service worker and icons.
  publicDir: 'static',
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom/client'], three: ['three'] } },
    },
  },
})
