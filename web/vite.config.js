import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Barlow Condensed (the PDF export's field font) is SIL OFL, whose terms
// travel with the font: ship its licence beside the build (CLAUDE.md).
const fontLicence = {
  name: 'font-licence',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'fonts/OFL.txt',
      source: readFileSync(new URL('../assets/fonts/OFL.txt', import.meta.url)),
    })
  },
}

// The standalone editor, served at bridge-craftwork.com/card/. Relative asset
// URLs (base './') so the build works at any path depth (CLAUDE.md).
export default defineConfig({
  base: './',
  plugins: [vue(), fontLicence],
  // The app imports the library, the spec and the assets from the repo root.
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
})
