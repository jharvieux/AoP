import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { assetBudgetPlugin } from './vite-plugins/assetBudget'
import { swVersionPlugin } from './vite-plugins/swVersion'

export default defineConfig({
  plugins: [react(), assetBudgetPlugin(), swVersionPlugin()],
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
