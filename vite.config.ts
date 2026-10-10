import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from "vite-plugin-singlefile";

// https://vite.dev/config/
function audioProxyPlugin() {
  const route = '/api/audio-proxy'

  return {
    name: 'audio-proxy-plugin',
    configureServer(server: any) {
      server.middlewares.use(route, async (req: any, res: any, next: any) => {
        if (req.method !== 'GET') return next()

        const url = typeof req.url === 'string' ? req.url : ''
        const parsed = new URL(url, 'http://localhost')
        const remoteUrl = parsed.searchParams.get('url')

        if (!remoteUrl) {
          res.statusCode = 400
          res.end('Missing audio url')
          return
        }

        try {
          const response = await fetch(remoteUrl)
          if (!response.ok) {
            res.statusCode = response.status
            res.end(await response.text())
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg')
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error: any) {
          res.statusCode = 500
          res.end(error?.message || 'Audio proxy failed')
        }
      })
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(route, async (req: any, res: any, next: any) => {
        if (req.method !== 'GET') return next()

        const url = typeof req.url === 'string' ? req.url : ''
        const parsed = new URL(url, 'http://localhost')
        const remoteUrl = parsed.searchParams.get('url')

        if (!remoteUrl) {
          res.statusCode = 400
          res.end('Missing audio url')
          return
        }

        try {
          const response = await fetch(remoteUrl)
          if (!response.ok) {
            res.statusCode = response.status
            res.end(await response.text())
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg')
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error: any) {
          res.statusCode = 500
          res.end(error?.message || 'Audio proxy failed')
        }
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    audioProxyPlugin(),
    viteSingleFile({
      useRecommendedBuildConfig: true
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5173',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
