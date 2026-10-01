import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The standalone editor, served at bridge-craftwork.com/card/. Relative asset
// URLs (base './') so the build works at any path depth (CLAUDE.md).
export default defineConfig({
  base: './',
  plugins: [vue()],
  // The app imports the library, the spec and the assets from the repo root.
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
})
