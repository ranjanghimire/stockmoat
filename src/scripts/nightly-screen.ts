/**
 * Nightly moat screener: prioritized symbol universe → FMP analysis → `screen_scores` upsert.
 *
 *   npm run screen:nightly
 *
 * Env (see also .env.example):
 *   fmpApiKey | FMP_API_KEY | VITE_FMP_API_KEY
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Priority planner (default):
 *   NIGHTLY_BUDGET (default 1000) — max symbols scored this run
 *   SCREEN_MAX_TICKERS (default 50) — core FMP screener slice size
 *   SCREEN_OFFSET (default 0) — offset into screener-ordered universe
 *   NIGHTLY_STALE_DAYS (default 14) — screen_scores older than this → stale tier
 *   NIGHTLY_TRENDING_LIMIT (default 100), NIGHTLY_TRENDING_PER_LIST (default 45)
 *   SCREEN_TICKER_GAP_MS (default 30000)
 *   SCREEN_FETCH_PEERS — passed through to analysis (default follows app rules)
 *
 * Legacy single-slice mode (no trending / DB merge):
 *   NIGHTLY_MODE=legacy
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { buildNightlySymbolPlan } from '../lib/nightly/buildNightlySymbolPlan'
import { fetchNightlyDbContext } from '../lib/nightly/fetchNightlyDbContext'
import { fetchFmpTrendingSymbols } from '../lib/fmp/fetchFmpTrendingMovers'
import { fetchScreenUniverse } from '../lib/fmp/fetchScreenUniverse'
import { recomputeForwardGrowthPercentiles } from '../lib/fmp/recomputeForwardGrowthPercentiles'
import { buildScreenScoreUpsert } from '../lib/screen/buildScreenScoreUpsert'
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

  const budget = Math.max(1, parseIntEnv('NIGHTLY_BUDGET', 1000))
  const maxTickers = Math.max(1, parseIntEnv('SCREEN_MAX_TICKERS', 50))
  const offset = Math.max(0, parseIntEnv('SCREEN_OFFSET', 0))
  const staleDays = Math.max(1, parseIntEnv('NIGHTLY_STALE_DAYS', 14))
  const gapMs = Math.max(0, parseIntEnv('SCREEN_TICKER_GAP_MS', 30000))
  const trendingLimit = Math.max(10, parseIntEnv('NIGHTLY_TRENDING_LIMIT', 100))
  const trendingPerList = Math.max(10, parseIntEnv('NIGHTLY_TRENDING_PER_LIST', 45))
  const legacy = env('NIGHTLY_MODE').toLowerCase() === 'legacy'

  const sb = createClient(supabaseUrl, serviceKey)

  let symbols: string[]

  if (legacy) {
    symbols = await fetchScreenUniverse(fmpKey, { maxTickers, offset })
    console.log(
      `[legacy] Universe: ${symbols.length} symbols (SCREEN_MAX_TICKERS=${maxTickers}, SCREEN_OFFSET=${offset}).`,
    )
  } else {
    const [dbCtx, trendingRank, coreOrdered] = await Promise.all([
      fetchNightlyDbContext(sb),
      fetchFmpTrendingSymbols(fmpKey, { limit: trendingLimit, perList: trendingPerList }).catch((e) => {
        console.warn('Trending fetch failed (continuing without):', e instanceof Error ? e.message : e)
        return new Map<string, number>()
      }),
      fetchScreenUniverse(fmpKey, { maxTickers, offset }),
    ])

    const plan = buildNightlySymbolPlan({
      budget,
      staleDays,
      nowMs: Date.now(),
      trendingRank,
      coreOrdered,
      db: dbCtx,
    })

    symbols = plan.symbols
    console.log(
      `[nightly] budget=${budget} staleDays=${staleDays} coreSlice=${coreOrdered.length} trending=${plan.debug.trendingUniverse} candidates=${plan.debug.candidateCount}`,
    )
    console.log(
      `[nightly] tier picks: trending=${plan.debug.trendingPicked} editorial=${plan.debug.editorialPicked} stale=${plan.debug.stalePicked} core=${plan.debug.corePicked} fill=${plan.debug.fillPicked} → total=${symbols.length}`,
    )
  }

  if (symbols.length === 0) {
    console.log('Nothing to do — empty symbol list.')
    return
  }

  console.log(`Gap ${gapMs}ms between tickers. Processing ${symbols.length} symbols.`)

  let ok = 0
  let fail = 0
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]!
    process.stdout.write(`[${i + 1}/${symbols.length}] ${sym} … `)
    try {
      const analysis = await runFmpMoatAnalysis(sym, fmpKey)
      const row = buildScreenScoreUpsert(analysis)
      const { error } = await sb.from('screen_scores').upsert(row, { onConflict: 'symbol' })
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

  try {
    console.log('Recomputing forward growth scores (1–10) across all screen_scores…')
    const { ranked, cleared } = await recomputeForwardGrowthPercentiles(sb)
    console.log(`Forward growth ranks: ${ranked} with consensus CAGR, ${cleared} without (score cleared).`)
  } catch (e) {
    console.error('Forward growth percentile update failed:', e instanceof Error ? e.message : e)
  }
  if (!legacy && symbols.length > 0 && symbols.length === budget) {
    console.log(`Hit NIGHTLY_BUDGET=${budget} cap — raise budget or rely on next run for remaining candidates.`)
  }
  if (!legacy && maxTickers > 0) {
    console.log(`Next core slice: SCREEN_OFFSET=${offset + maxTickers} with same SCREEN_MAX_TICKERS=${maxTickers}.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
