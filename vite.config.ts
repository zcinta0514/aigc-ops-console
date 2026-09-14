import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    ...(mode === 'single' ? [viteSingleFile()] : []),
  ],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 7000 },
}))
