/**
 * Batch FMP moat scores into Supabase. Run from project root:
 *   npm run screen:nightly
 *
 * Requires in .env / .env.local: fmpApiKey, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SCREEN_MAX_TICKERS (default 50), SCREEN_TICKER_GAP_MS (default 30000)
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fetchScreenUniverse } from '../lib/fmp/fetchScreenUniverse'
import { runFmpMoatAnalysis } from '../lib/runFmpMoatAnalysis'

loadDotenv({ path: '.env.local' })
loadDotenv()

function env(name: string, fallback = ''): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main(): Promise<void> {
  const fmpKey = env('fmpApiKey') || env('FMP_API_KEY') || env('VITE_FMP_API_KEY')
  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!fmpKey) {
    console.error('Missing fmpApiKey (or FMP_API_KEY) in environment.')
    process.exit(1)
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const maxTickers = Math.max(1, Number.parseInt(env('SCREEN_MAX_TICKERS', '50'), 10) || 50)
  const gapMs = Math.max(0, Number.parseInt(env('SCREEN_TICKER_GAP_MS', '30000'), 10) || 0)

  const symbols = await fetchScreenUniverse(fmpKey, maxTickers)
  console.log(`Universe: ${symbols.length} symbols (cap ${maxTickers}). Gap ${gapMs}ms between tickers.`)

  const sb = createClient(supabaseUrl, serviceKey)

  let ok = 0
  let fail = 0
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]!
    process.stdout.write(`[${i + 1}/${symbols.length}] ${sym} … `)
    try {
      const analysis = await runFmpMoatAnalysis(sym, fmpKey, { fetchPeers: true })
      const { error } = await sb.from('screen_scores').upsert(
        {
          symbol: analysis.ticker,
          display_name: analysis.displayName,
          score: analysis.score,
          profile_id: analysis.profileId,
          sector: analysis.sector ?? null,
          industry: analysis.industry ?? null,
          any_gate_fail: analysis.anyGateFail,
          score_cap: analysis.scoreCap,
          raw_weighted: analysis.rawWeighted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'symbol' },
      )
      if (error) throw new Error(error.message)
      console.log(`score ${analysis.score.toFixed(2)}`)
      ok++
    } catch (e) {
      console.log(`ERR ${e instanceof Error ? e.message : String(e)}`)
      fail++
    }
    if (i < symbols.length - 1 && gapMs > 0) await sleep(gapMs)
  }

  console.log(`Done. OK ${ok}, failed ${fail}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
