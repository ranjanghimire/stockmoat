import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fmpKey = env.fmpApiKey ?? env.VITE_FMP_API_KEY ?? ''
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.FMP_API_KEY': JSON.stringify(fmpKey),
    },
  }
})
