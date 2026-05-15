/**
 * Backfill company_moat_summaries for symbols in screen_scores ∪ ticker_fmp_home_cache,
 * plus any existing company_moat_summaries row that is not curated.
 *
 * Non-curated (auto_generated): fills any empty of body / how_they_make_money / recent_deals.
 *   Set EDITORIAL_BACKFILL_REFRESH_ALL=1 to regenerate all three for every auto row (heavy).
 * Curated: never touches body/how; by default only sets recent_deals_body when empty,
 *   or when existing text matches generic IR/automated-summary filler (see recentDealsOverrides).
 *   One-time: EDITORIAL_BACKFILL_CURATED_RECENT_DEALS_ALL=1 regenerates recent_deals_body for
 *   every curated row (still deals-only; NVDA/AMD use RECENT_DEALS_OVERRIDES).
 *
 *   npm run backfill:editorial
 *   npm run backfill:editorial:curated-recent-all   # one-time curated recent_deals sweep
 *
 * Env: fmpApiKey, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: BACKFILL_GAP_MS (default 400), BACKFILL_LIMIT (first N only),
 *   EDITORIAL_BACKFILL_REFRESH_ALL=1 (full refresh all auto rows),
 *   EDITORIAL_BACKFILL_CURATED_RECENT_DEALS_ALL=1 (full recent_deals refresh for all curated)
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import type { GeneratedEditorial } from '../src/lib/editorial/generateEditorialFromProfile'
import { generateEditorialFromProfile } from '../src/lib/editorial/generateEditorialFromProfile'
import { pilotEditorialForSymbol } from '../src/lib/editorial/pilotEditorialTexts'
import { RECENT_DEALS_OVERRIDES, isGenericRecentDealsFiller } from '../src/lib/editorial/recentDealsOverrides'
import { editorialInputFromRawPack } from '../src/lib/editorial/profileFromRawPack'
import type { CompanyRawPack } from '../src/lib/fmp/fetchCompanyRawPack'
import { fmpGet } from '../src/lib/fmp/http'
import { asArray, type JsonRecord } from '../src/lib/fmp/normalize'
import { fmpPayloadHasErrorMessage } from '../src/lib/fmp/profileClassification'

loadDotenv({ path: '.env.local' })
loadDotenv()

function env(name: string, fallback = ''): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAllSymbolsFromScoresAndCache(sb: ReturnType<typeof createClient>): Promise<string[]> {
  const out = new Set<string>()
  for (const table of ['screen_scores', 'ticker_fmp_home_cache'] as const) {
    let from = 0
    for (;;) {
      const { data, error } = await sb.from(table).select('symbol').range(from, from + 999)
      if (error) throw new Error(`${table}: ${error.message}`)
      for (const r of data ?? []) {
        const s = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
        if (s) out.add(s)
      }
      if (!data || data.length < 1000) break
      from += 1000
    }
  }
  return [...out].sort()
}

type MoatRow = {
  symbol: string
  body: string | null
  how_they_make_money_body: string | null
  recent_deals_body: string | null
  content_source: string | null
}

async function fetchMoatMap(sb: ReturnType<typeof createClient>): Promise<Map<string, MoatRow>> {
  const map = new Map<string, MoatRow>()
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('company_moat_summaries')
      .select('symbol, body, how_they_make_money_body, recent_deals_body, content_source')
      .range(from, from + 999)
    if (error) throw new Error(`company_moat_summaries: ${error.message}`)
    for (const r of (data ?? []) as MoatRow[]) {
      const s = r.symbol?.trim().toUpperCase()
      if (s) map.set(s, r)
    }
    if (!data || data.length < 1000) break
    from += 1000
  }
  return map
}

async function fetchLatestPackBySymbol(
  sb: ReturnType<typeof createClient>,
): Promise<Map<string, CompanyRawPack>> {
  const map = new Map<string, CompanyRawPack>()
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('ticker_fmp_home_cache')
      .select('symbol, company_raw_pack, updated_at')
      .order('updated_at', { ascending: false })
      .range(from, from + 199)
    if (error) throw new Error(`ticker_fmp_home_cache: ${error.message}`)
    for (const r of data ?? []) {
      const sym = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
      const pack = r.company_raw_pack as CompanyRawPack | null
      if (!sym || !pack || map.has(sym)) continue
      map.set(sym, pack)
    }
    if (!data || data.length < 200) break
    from += 200
  }
  return map
}

async function fetchProfileOnly(sym: string, apiKey: string): Promise<CompanyRawPack | null> {
  try {
    const raw = await fmpGet<unknown>(`/stable/profile?symbol=${encodeURIComponent(sym)}`, apiKey)
    if (fmpPayloadHasErrorMessage(raw)) return null
    const row = asArray<JsonRecord>(raw)[0]
    if (!row) return null
    return { profile: row } as CompanyRawPack
  } catch {
    return null
  }
}

function buildWorkSet(
  scoresCache: string[],
  moatMap: Map<string, MoatRow>,
  includeEveryCurated: boolean,
): string[] {
  const set = new Set<string>()
  for (const s of scoresCache) set.add(s)
  for (const [sym, row] of moatMap) {
    if (row.content_source !== 'curated') {
      set.add(sym)
    } else if (includeEveryCurated) {
      set.add(sym)
    }
  }
  for (const s of Object.keys(RECENT_DEALS_OVERRIDES)) {
    const u = s.trim().toUpperCase()
    if (u) set.add(u)
  }
  return [...set].sort()
}

function autoRowNeedsWork(row: MoatRow, refreshAllAuto: boolean): boolean {
  if (refreshAllAuto) return true
  return (
    !row.body?.trim() ||
    !row.how_they_make_money_body?.trim() ||
    !row.recent_deals_body?.trim()
  )
}

function shouldProcessSymbol(
  sym: string,
  row: MoatRow | undefined,
  refreshAllAuto: boolean,
  refreshAllCuratedRecentDeals: boolean,
): boolean {
  if (!row) return true
  if (row.content_source === 'curated') {
    if (refreshAllCuratedRecentDeals) return true
    if (RECENT_DEALS_OVERRIDES[sym]) return true
    const d = row.recent_deals_body?.trim()
    if (!d) return true
    if (isGenericRecentDealsFiller(d)) return true
    return false
  }
  return autoRowNeedsWork(row, refreshAllAuto)
}

function mergeGenerated(input: GeneratedEditorial, sym: string): GeneratedEditorial {
  const deals = RECENT_DEALS_OVERRIDES[sym]
  if (deals) return { ...input, recentDealsBody: deals }
  return input
}

async function main(): Promise<void> {
  const fmpKey = env('fmpApiKey') || env('FMP_API_KEY')
  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!fmpKey || !supabaseUrl || !serviceKey) {
    console.error('Need fmpApiKey, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const gapMs = Math.max(0, Number.parseInt(env('BACKFILL_GAP_MS', '400'), 10) || 400)
  const limit = Number.parseInt(env('BACKFILL_LIMIT', '0'), 10) || 0
  const refreshAllAuto =
    env('EDITORIAL_BACKFILL_REFRESH_ALL') === '1' || env('EDITORIAL_BACKFILL_REFRESH_ALL').toLowerCase() === 'true'
  const refreshAllCuratedRecentDeals =
    env('EDITORIAL_BACKFILL_CURATED_RECENT_DEALS_ALL') === '1' ||
    env('EDITORIAL_BACKFILL_CURATED_RECENT_DEALS_ALL').toLowerCase() === 'true'

  const sb = createClient(supabaseUrl, serviceKey)
  const scoresCache = await fetchAllSymbolsFromScoresAndCache(sb)
  const moatMap = await fetchMoatMap(sb)
  const packMap = await fetchLatestPackBySymbol(sb)

  const candidates = buildWorkSet(scoresCache, moatMap, refreshAllCuratedRecentDeals)
  const todo = candidates.filter((s) =>
    shouldProcessSymbol(s, moatMap.get(s), refreshAllAuto, refreshAllCuratedRecentDeals),
  )
  const work = limit > 0 ? todo.slice(0, limit) : todo

  console.log(
    `Universe: ${scoresCache.length} from scores/cache; ${moatMap.size} moat rows; ${candidates.length} union; ${todo.length} to process; running ${work.length}. Pack cache: ${packMap.size}. refresh_all_auto=${refreshAllAuto} refresh_all_curated_recent=${refreshAllCuratedRecentDeals}`,
  )

  let ok = 0
  let skip = 0
  let fail = 0

  for (let i = 0; i < work.length; i++) {
    const sym = work[i]!
    const existing = moatMap.get(sym)
    const curated = existing?.content_source === 'curated'

    process.stdout.write(`[${i + 1}/${work.length}] ${sym} … `)

    try {
      if (
        curated &&
        existing?.recent_deals_body?.trim() &&
        !refreshAllCuratedRecentDeals &&
        !RECENT_DEALS_OVERRIDES[sym] &&
        !isGenericRecentDealsFiller(existing.recent_deals_body)
      ) {
        console.log('skip (curated, deals present)')
        skip++
        continue
      }

      if (curated && RECENT_DEALS_OVERRIDES[sym]) {
        const { error } = await sb
          .from('company_moat_summaries')
          .update({
            recent_deals_body: RECENT_DEALS_OVERRIDES[sym],
            updated_at: new Date().toISOString(),
          })
          .eq('symbol', sym)
        if (error) throw new Error(error.message)
        console.log('curated: recent_deals override')
        ok++
        if (i < work.length - 1 && gapMs > 0) await sleep(gapMs)
        continue
      }

      let pack = packMap.get(sym)
      if (!pack) pack = (await fetchProfileOnly(sym, fmpKey)) ?? undefined
      if (!pack) {
        console.log('skip (no profile)')
        skip++
        continue
      }

      const input = editorialInputFromRawPack(sym, pack)
      if (!input) {
        console.log('skip (no description)')
        skip++
        continue
      }

      const pilot = pilotEditorialForSymbol(sym)
      const rawGen = pilot ?? generateEditorialFromProfile(input)
      const gen = mergeGenerated(rawGen, sym)

      if (curated && existing) {
        const { error } = await sb
          .from('company_moat_summaries')
          .update({
            recent_deals_body: gen.recentDealsBody,
            updated_at: new Date().toISOString(),
          })
          .eq('symbol', sym)
        if (error) throw new Error(error.message)
        console.log('curated: recent_deals only')
      } else {
        const merged = refreshAllAuto
          ? {
              body: gen.moatBody,
              how_they_make_money_body: gen.howTheyMakeMoneyBody,
              recent_deals_body: gen.recentDealsBody,
            }
          : {
              body: existing?.body?.trim() || gen.moatBody,
              how_they_make_money_body: existing?.how_they_make_money_body?.trim() || gen.howTheyMakeMoneyBody,
              recent_deals_body: existing?.recent_deals_body?.trim() || gen.recentDealsBody,
            }
        const { error } = await sb.from('company_moat_summaries').upsert(
          {
            symbol: sym,
            ...merged,
            content_source: 'auto_generated',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'symbol' },
        )
        if (error) throw new Error(error.message)
        console.log(refreshAllAuto ? 'auto: full refresh' : 'auto: gap fill')
      }
      ok++
    } catch (e) {
      console.log(`ERR ${e instanceof Error ? e.message : String(e)}`)
      fail++
    }

    if (i < work.length - 1 && gapMs > 0) await sleep(gapMs)
  }

  console.log(`Done. OK ${ok}, skipped ${skip}, failed ${fail}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
