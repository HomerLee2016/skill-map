import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

// https://vite.dev/config/
function roadmapSavePlugin() {
  const route = '/api/save-roadmap'
  async function handleSave(req: any, res: any) {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
    })
    req.on('end', async () => {
      try {
        const { roadmapId, yaml } = JSON.parse(body || '{}')
        if (!roadmapId || typeof roadmapId !== 'string') {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Missing roadmapId' }))
          return
        }
        if (typeof yaml !== 'string') {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Missing yaml' }))
          return
        }
        const filePath = path.resolve(process.cwd(), 'src', 'data', `${roadmapId}.yaml`)
        const allowedRoot = path.resolve(process.cwd(), 'src', 'data')
        if (!filePath.startsWith(allowedRoot)) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Invalid roadmap path' }))
          return
        }
        await fs.writeFile(filePath, yaml, 'utf8')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (error: any) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: error?.message || 'Save failed' }))
      }
    })
  }

  return {
    name: 'roadmap-save-plugin',
    configureServer(server: any) {
      server.middlewares.use(route, (req: any, res: any, next: any) => {
        if (req.method !== 'POST') return next()
        handleSave(req, res)
      })
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(route, (req: any, res: any, next: any) => {
        if (req.method !== 'POST') return next()
        handleSave(req, res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), roadmapSavePlugin()],
})
