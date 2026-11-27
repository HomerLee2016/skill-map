import { existsSync, readdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { audioProxyPlugin } from './vite/plugins/audioProxy.ts'
import { cspHashesPlugin } from './vite/plugins/cspHashes.ts'

// Names of the repo's Supabase scripts, so the Admin tab can compare them with what the database reports.
const migrationsDir = new URL('./supabase/migrations/', import.meta.url)
const migrationFiles = existsSync(migrationsDir)
  ? readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  : []

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: { __MIGRATION_FILES__: JSON.stringify(migrationFiles) },
  plugins: [
    react(),
    audioProxyPlugin(),
    viteSingleFile({
      useRecommendedBuildConfig: true,
    }),
    cspHashesPlugin(),
  ],
})
