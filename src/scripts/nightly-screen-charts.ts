/**
 * After `screen:nightly`, precompute FMP weekly/daily OHLC for every symbol in `screen_scores`
 * and upsert into `screen_charts` for the Screener page popup.
 *
 *   npm run screen:charts
 *
 * Env (same as nightly screener): fmpApiKey or FMP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Throttle: SCREEN_TICKER_GAP_MS (default 30000) or SCREEN_CHART_GAP_MS when set.
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fetchFmpPriceCharts } from '../lib/fmp/fetchFmpPriceCharts'
import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'

loadDotenv({ path: '.env.local' })
loadDotenv()

function env(name: string, fallback = ''): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isPriceChartsPayload(v: unknown): v is PriceChartsPayload {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.symbol === 'string' && Array.isArray(o.weekly) && Array.isArray(o.daily)
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

  const gapMs = Math.max(
    0,
    Number.parseInt(env('SCREEN_CHART_GAP_MS') || env('SCREEN_TICKER_GAP_MS', '30000'), 10) || 0,
  )

  const sb = createClient(supabaseUrl, serviceKey)

  const { data: rows, error: listErr } = await sb.from('screen_scores').select('symbol').order('symbol', {
    ascending: true,
  })
  if (listErr) {
    console.error('Failed to list screen_scores:', listErr.message)
    process.exit(1)
  }
  const symbols = (rows ?? []).map((r) => (typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : '')).filter(Boolean)
  console.log(`screen_charts: ${symbols.length} symbols from screen_scores. Gap ${gapMs}ms between FMP chart pulls.`)

  if (symbols.length === 0) {
    console.log('Nothing to do — screen_scores is empty.')
    return
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]!
    process.stdout.write(`[${i + 1}/${symbols.length}] ${sym} … `)
    try {
      const payload = await fetchFmpPriceCharts(sym, fmpKey)
      if (!isPriceChartsPayload(payload)) {
        throw new Error('Internal: chart payload shape invalid')
      }
      const { error } = await sb.from('screen_charts').upsert(
        {
          symbol: sym,
          payload,
          fetch_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'symbol' },
      )
      if (error) throw new Error(error.message)
      console.log('ok')
      ok++
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 2000)
      const { error: upErr } = await sb.from('screen_charts').upsert(
        {
          symbol: sym,
          payload: null,
          fetch_error: msg,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'symbol' },
      )
      if (upErr) {
        console.log(`ERR ${msg} (also failed to persist error: ${upErr.message})`)
      } else {
        console.log(`ERR ${msg}`)
      }
      fail++
    }
    if (i < symbols.length - 1 && gapMs > 0) await sleep(gapMs)
  }

  console.log(`screen_charts done. OK ${ok}, failed ${fail}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
