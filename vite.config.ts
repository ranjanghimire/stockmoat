import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { yahooDevCompanyPlugin } from './vite.yahooDevPlugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  /** Vercel / CI inject into `process.env` at build time; merge so both .env and dashboard names work. */
  const env = { ...process.env, ...fileEnv } as Record<string, string | undefined>

  const fmpKey = (env.fmpApiKey ?? env.VITE_FMP_API_KEY ?? env.FMP_API_KEY ?? '').trim()
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim()
  const supabaseAnon = (env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '').trim()

  return {
    plugins: [react(), tailwindcss(), yahooDevCompanyPlugin()],
    define: {
      'import.meta.env.FMP_API_KEY': JSON.stringify(fmpKey),
      ...(supabaseUrl ? { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl) } : {}),
      ...(supabaseAnon ? { 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnon) } : {}),
    },
  }
})
