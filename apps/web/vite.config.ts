import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { assetBudgetPlugin } from './vite-plugins/assetBudget'

export default defineConfig({
  plugins: [react(), assetBudgetPlugin()],
})
