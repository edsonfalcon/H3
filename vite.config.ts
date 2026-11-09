import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'
const buildId = commit === 'dev' ? 'dev' : commit.slice(0, 7)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildId),
  },
})
