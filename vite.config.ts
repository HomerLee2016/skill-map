import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { audioProxyPlugin } from './vite/plugins/audioProxy.ts'
import { cspHashesPlugin } from './vite/plugins/cspHashes.ts'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    audioProxyPlugin(),
    viteSingleFile({
      useRecommendedBuildConfig: true,
    }),
    cspHashesPlugin(),
  ],
})
