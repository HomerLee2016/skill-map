import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

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
        const filePath = path.resolve(process.cwd(), 'src', 'data', 'roadmaps', `${roadmapId}.yaml`)
        const allowedRoot = path.resolve(process.cwd(), 'src', 'data', 'roadmaps')
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

function testResultSavePlugin() {
  const route = '/api/save-test-result'
  async function handleSave(req: any, res: any) {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
    })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const { testId, timestamp } = payload
        if (!testId || typeof testId !== 'string') {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Missing testId' }))
          return
        }
        if (!timestamp || typeof timestamp !== 'string') {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Missing timestamp' }))
          return
        }
        if (!Array.isArray(payload.questions)) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Missing questions' }))
          return
        }
        const resultDir = path.resolve(process.cwd(), 'src', 'data', 'tests', 'result')
        await fs.mkdir(resultDir, { recursive: true })
        const safeTimestamp = timestamp.replace(/[:.]/g, '-')
        const fileName = `${testId}_${safeTimestamp}.yaml`
        const filePath = path.resolve(resultDir, fileName)
        if (!filePath.startsWith(resultDir)) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Invalid result path' }))
          return
        }
        const yaml = YAML.stringify(payload)
        await fs.writeFile(filePath, yaml, 'utf8')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, fileName }))
      } catch (error: any) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: error?.message || 'Save failed' }))
      }
    })
  }

  return {
    name: 'test-result-save-plugin',
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
  plugins: [react(), roadmapSavePlugin(), testResultSavePlugin()],
})
