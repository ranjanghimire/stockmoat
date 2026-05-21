/**
 * Nightly: for each symbol in `screen_scores`, fetch next earnings via FMP `/stable/earnings`
 * and upsert `ticker_next_earnings` for the Home page.
 *
 *   npm run screen:earnings
 *
 * Env: fmpApiKey | FMP_API_KEY | VITE_FMP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Throttle: SCREEN_EARNINGS_GAP_MS when set, else SCREEN_TICKER_GAP_MS (default 3000 ms).
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fetchFmpNextEarningsDate, utcCalendarDateString } from '../lib/fmp/fetchFmpNextEarningsDate'

loadDotenv({ path: '.env.local' })
loadDotenv()

function env(name: string, fallback = ''): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function parseIntEnv(name: string, def: number): number {
  const v = Number.parseInt(env(name, String(def)), 10)
  return Number.isFinite(v) ? v : def
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

  const earningsGap = env('SCREEN_EARNINGS_GAP_MS')
  const gapMs = Math.max(
    0,
    earningsGap !== '' ? Number.parseInt(earningsGap, 10) || 0 : parseIntEnv('SCREEN_TICKER_GAP_MS', 3000),
  )

  const sb = createClient(supabaseUrl, serviceKey)

  const pageSize = 1000
  const symbols: string[] = []
  for (let from = 0; ; from += pageSize) {
    const { data: rows, error: listErr } = await sb
      .from('screen_scores')
      .select('symbol')
      .order('symbol', { ascending: true })
      .range(from, from + pageSize - 1)
    if (listErr) {
      console.error('Failed to list screen_scores:', listErr.message)
      process.exit(1)
    }
    const batch = (rows ?? [])
      .map((r) => (typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''))
      .filter(Boolean)
    symbols.push(...batch)
    if (batch.length < pageSize) break
  }

  console.log(
    `ticker_next_earnings: ${symbols.length} symbols from screen_scores. Gap ${gapMs}ms between FMP calls. Today(UTC)=${utcCalendarDateString()}`,
  )

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
      const { nextDate } = await fetchFmpNextEarningsDate(sym, fmpKey)
      const { error } = await sb.from('ticker_next_earnings').upsert(
        {
          symbol: sym,
          next_earnings_date: nextDate,
          fetch_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'symbol' },
      )
      if (error) throw new Error(error.message)
      console.log(nextDate ? `ok ${nextDate}` : 'ok (no upcoming)')
      ok++
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 2000)
      const { error: upErr } = await sb.from('ticker_next_earnings').upsert(
        {
          symbol: sym,
          next_earnings_date: null,
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

  console.log(`ticker_next_earnings done. OK ${ok}, failed ${fail}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
