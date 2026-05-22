/**
 * After `screen:nightly`, precompute FMP weekly/daily OHLC for every symbol in `screen_scores`
 * and upsert into `screen_charts` for the Screener page popup.
 *
 *   npm run screen:charts
 *
 * Env (same as nightly screener): fmpApiKey or FMP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Throttle: SCREEN_TICKER_GAP_MS (default 30000) or SCREEN_CHART_GAP_MS when set.
 * Cap: NIGHTLY_CHART_BUDGET (0 = no cap). Missing/failed charts are processed first.
 */
import { config as loadDotenv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchFmpPriceCharts } from '../lib/fmp/fetchFmpPriceCharts'
import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type ChartRowMeta = { updated_at: string | null; fetch_error: string | null }

/** 0 = missing row, 1 = prior fetch_error, 2 = refresh oldest successful charts. */
function chartPriorityTier(sym: string, meta: Map<string, ChartRowMeta>): number {
  const row = meta.get(sym)
  if (!row) return 0
  if (row.fetch_error) return 1
  return 2
}

function orderSymbolsForCharts(all: string[], meta: Map<string, ChartRowMeta>): string[] {
  return [...all].sort((a, b) => {
    const ta = chartPriorityTier(a, meta)
    const tb = chartPriorityTier(b, meta)
    if (ta !== tb) return ta - tb
    if (ta === 2) {
      const ua = meta.get(a)?.updated_at ?? ''
      const ub = meta.get(b)?.updated_at ?? ''
      return ua.localeCompare(ub)
    }
    return a.localeCompare(b)
  })
}

async function fetchChartMetaBySymbol(sb: SupabaseClient): Promise<Map<string, ChartRowMeta>> {
  const map = new Map<string, ChartRowMeta>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data: rows, error } = await sb
      .from('screen_charts')
      .select('symbol, updated_at, fetch_error')
      .order('symbol', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = rows ?? []
    for (const r of batch) {
      const sym = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
      if (!sym) continue
      map.set(sym, {
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
        fetch_error: typeof r.fetch_error === 'string' ? r.fetch_error : null,
      })
    }
    if (batch.length < pageSize) break
  }
  return map
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
  const chartBudget = Math.max(0, parseIntEnv('NIGHTLY_CHART_BUDGET', 0))

  const sb = createClient(supabaseUrl, serviceKey)

  // PostgREST caps each response (often 1000 rows). Page so we do not silently skip symbols.
  const pageSize = 1000
  const allSymbols: string[] = []
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
    allSymbols.push(...batch)
    if (batch.length < pageSize) break
  }

  let chartMeta: Map<string, ChartRowMeta>
  try {
    chartMeta = await fetchChartMetaBySymbol(sb)
  } catch (e) {
    console.error('Failed to list screen_charts:', e instanceof Error ? e.message : e)
    process.exit(1)
  }

  const ordered = orderSymbolsForCharts(allSymbols, chartMeta)
  const missing = ordered.filter((s) => !chartMeta.has(s)).length
  const failed = ordered.filter((s) => chartMeta.get(s)?.fetch_error).length
  const symbols =
    chartBudget > 0 ? ordered.slice(0, chartBudget) : ordered

  console.log(
    `screen_charts: ${allSymbols.length} in screen_scores, ${chartMeta.size} existing rows, ` +
      `priority missing=${missing} failed=${failed}, processing ${symbols.length}` +
      (chartBudget > 0 ? ` (NIGHTLY_CHART_BUDGET=${chartBudget})` : '') +
      `. Gap ${gapMs}ms between FMP chart pulls.`,
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
