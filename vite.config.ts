import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function shaDeCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA !== undefined) {
    return process.env.VERCEL_GIT_COMMIT_SHA
  }
  try {
    return readFileSync('build-sha.txt', 'utf8').trim()
  } catch {
    try {
      return execSync('git rev-parse HEAD').toString().trim()
    } catch {
      return 'dev'
    }
  }
}

const commit = shaDeCommit()
const buildId = commit === 'dev' ? 'dev' : commit.slice(0, 7)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildId),
  },
})
