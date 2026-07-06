import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { assetBudgetPlugin } from './vite-plugins/assetBudget'
import { swVersionPlugin } from './vite-plugins/swVersion'

export default defineConfig({
  plugins: [react(), assetBudgetPlugin(), swVersionPlugin()],
})
