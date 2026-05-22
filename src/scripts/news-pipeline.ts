/**
 * Material news pipeline: FMP news/press + SEC 8-K for anchor tickers → Gemini → material_news.
 *
 *   npm run news:pipeline
 *
 * Env: FMP_API_KEY (or fmpApiKey), GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: GEMINI_MODEL, SEC_USER_AGENT, NEWS_FMP_GAP_MS, NEWS_SEC_GAP_MS
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { runNewsPipeline } from '../lib/news/runNewsPipeline'

loadDotenv({ path: '.env.local' })
loadDotenv()

function env(name: string, fallback = ''): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : fallback
}

function parseIntEnv(name: string, def: number): number {
  const v = Number.parseInt(env(name, String(def)), 10)
  return Number.isFinite(v) ? v : def
}

async function main(): Promise<void> {
  const fmpKey = env('fmpApiKey') || env('FMP_API_KEY') || env('VITE_FMP_API_KEY')
  const geminiKey = env('GEMINI_API_KEY')
  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')

  if (!fmpKey) {
    console.error('Missing FMP API key.')
    process.exit(1)
  }
  if (!geminiKey) {
    console.error('Missing GEMINI_API_KEY.')
    process.exit(1)
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const sb = createClient(supabaseUrl, serviceKey)
  console.log('Starting material news pipeline…')

  const stats = await runNewsPipeline(sb, {
    fmpApiKey: fmpKey,
    geminiApiKey: geminiKey,
    geminiModel: env('GEMINI_MODEL') || undefined,
    secUserAgent: env('SEC_USER_AGENT') || undefined,
    fmpGapMs: parseIntEnv('NEWS_FMP_GAP_MS', 400),
    secGapMs: parseIntEnv('NEWS_SEC_GAP_MS', 280),
  })

  console.log('Done.', JSON.stringify(stats, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
