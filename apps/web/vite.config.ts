import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { assetBudgetPlugin } from './vite-plugins/assetBudget'
import { swVersionPlugin } from './vite-plugins/swVersion'

// vitest 4 resolves bare imports in files outside the project root (apps/web) via
// each file's own filesystem ancestry rather than the root's node_modules, so
// supabase/functions/_shared/*.ts (a Deno tree with no node_modules of its own)
// can no longer find the pnpm workspace symlinks for @aop/* packages that only
// apps/web/node_modules provides. catalogParity.test.ts (#250) imports one of
// those files, so alias the @aop/* specifiers used under supabase/functions/_shared
// straight to workspace package source — same targets the symlinks would resolve to.
const packagesDir = fileURLToPath(new URL('../../packages', import.meta.url))

export default defineConfig({
  plugins: [react(), assetBudgetPlugin(), swVersionPlugin()],
  resolve: {
    alias: [
      { find: '@aop/content', replacement: `${packagesDir}/content/src/index.ts` },
      { find: '@aop/engine', replacement: `${packagesDir}/engine/src/index.ts` },
      { find: /^@aop\/shared\/(.*)$/, replacement: `${packagesDir}/shared/src/$1.ts` },
      { find: '@aop/shared', replacement: `${packagesDir}/shared/src/index.ts` },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Explicit code-splitting: separate shared vendor code to allow better chunking (#353).
        // This ensures dependencies like pixi.js split properly across chunks.
        manualChunks(id) {
          // Isolate pixi.js into its own chunk (loaded only by gameplay screens).
          if (id.includes('node_modules/pixi.js')) return 'pixi'
          // Isolate other major vendors to reduce main bundle bloat.
          if (id.includes('node_modules/supabase')) return 'supabase'
          // Core app runtime stays in main.
          return undefined
        },
      },
    },
  },
})
