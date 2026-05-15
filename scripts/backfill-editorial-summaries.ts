/**
 * Backfill company_moat_summaries for symbols in screen_scores ∪ ticker_fmp_home_cache.
 * Fills missing: body, how_they_make_money_body, recent_deals_body.
 * Does not overwrite curated body/how when content_source = 'curated'.
 *
 *   npm run backfill:editorial
 *
 * Env: fmpApiKey, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: BACKFILL_GAP_MS (default 400), BACKFILL_LIMIT (process first N only)
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { generateEditorialFromProfile } from '../src/lib/editorial/generateEditorialFromProfile'
import { RECENT_DEALS_OVERRIDES } from '../src/lib/editorial/recentDealsOverrides'
import { editorialInputFromRawPack } from '../src/lib/editorial/profileFromRawPack'
import { fmpGet } from '../src/lib/fmp/http'
import { asArray, type JsonRecord } from '../src/lib/fmp/normalize'
import { fmpPayloadHasErrorMessage } from '../src/lib/fmp/profileClassification'
import { moatCopyMissing } from '../src/lib/nightly/nightlyPriority'
import type { CompanyRawPack } from '../src/lib/fmp/fetchCompanyRawPack'

loadDotenv({ path: '.env.local' })
loadDotenv()

function env(name: string, fallback = ''): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAllSymbols(sb: ReturnType<typeof createClient>): Promise<string[]> {
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

function needsWork(sym: string, row: MoatRow | undefined): boolean {
  if (!row) return true
  const curated = row.content_source === 'curated'
  const missingMoat = moatCopyMissing(row.body, row.how_they_make_money_body)
  const missingDeals = !row.recent_deals_body?.trim()
  if (!row) return true
  if (curated) return missingDeals
  return missingMoat || missingDeals
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

  const sb = createClient(supabaseUrl, serviceKey)
  const symbols = await fetchAllSymbols(sb)
  const moatMap = await fetchMoatMap(sb)
  const packMap = await fetchLatestPackBySymbol(sb)

  const todo = symbols.filter((s) => needsWork(s, moatMap.get(s)))
  const work = limit > 0 ? todo.slice(0, limit) : todo

  console.log(
    `Symbols: ${symbols.length} total, ${todo.length} need fill, processing ${work.length}. Pack cache hits: ${packMap.size}.`,
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
      let pack = packMap.get(sym)
      if (!pack) {
        pack = (await fetchProfileOnly(sym, fmpKey)) ?? undefined
      }
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

      const gen = generateEditorialFromProfile(input)
      const dealsOverride = RECENT_DEALS_OVERRIDES[sym]
      if (dealsOverride) gen.recentDealsBody = dealsOverride
      const payload: Record<string, unknown> = {
        symbol: sym,
        updated_at: new Date().toISOString(),
      }

      if (!existing) {
        payload.body = gen.moatBody
        payload.how_they_make_money_body = gen.howTheyMakeMoneyBody
        payload.recent_deals_body = gen.recentDealsBody
        payload.content_source = 'auto_generated'
      } else if (curated) {
        if (!existing.recent_deals_body?.trim()) {
          payload.recent_deals_body = gen.recentDealsBody
        } else {
          console.log('skip (curated complete)')
          skip++
          continue
        }
      } else {
        if (moatCopyMissing(existing.body, existing.how_they_make_money_body)) {
          payload.body = gen.moatBody
          payload.how_they_make_money_body = gen.howTheyMakeMoneyBody
        }
        if (!existing.recent_deals_body?.trim()) {
          payload.recent_deals_body = gen.recentDealsBody
        }
        payload.content_source = 'auto_generated'
      }

      if (curated && existing) {
        const { error } = await sb
          .from('company_moat_summaries')
          .update({
            recent_deals_body: payload.recent_deals_body as string,
            updated_at: payload.updated_at as string,
          })
          .eq('symbol', sym)
        if (error) throw new Error(error.message)
        console.log('deals only (update)')
      } else {
        const { error } = await sb.from('company_moat_summaries').upsert(payload, { onConflict: 'symbol' })
        if (error) throw new Error(error.message)
        console.log('upserted')
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
