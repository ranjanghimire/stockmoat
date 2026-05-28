import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fetchCompanyRawPack } from './_shared/fetchCompanyRawPack.ts'
import { fetchPeerMedians, EMPTY_PEER_MEDIANS } from './_shared/peerMedians.ts'
import type { CompanyRawPack } from './_shared/fetchCompanyRawPack.ts'
import type { PeerMedians } from './_shared/peerMedians.ts'
import {
  buildForwardGrowthChartsFromPack,
  forwardGrowthChartsComplete,
  forwardGrowthChartsUsable,
  type ForwardGrowthCharts,
} from './_shared/parseForwardEstimates.ts'
import {
  forwardRevenueCagrFromCharts,
  forwardGrowthScoreFromCharts,
  fetchForwardGrowthCagrUniverse,
  clearForwardGrowthCagrUniverseCache,
} from './_shared/forwardRevenueGrowthScore.ts'
import { recomputeForwardGrowthPercentiles } from './_shared/recomputeForwardGrowthPercentiles.ts'
import {
  planHomeCacheRefresh,
  refreshLockActive,
  buildHomeCacheAges,
  REFRESH_LOCK_MS,
  type HomeCacheSliceId,
  type HomeCacheRowInput,
} from './_shared/homeCachePlan.ts'
import { fmpGet } from './_shared/http.ts'
import { asArray, firstRow, type JsonRecord } from './_shared/normalize.ts'
import { fmpPayloadHasErrorMessage } from './_shared/profileClassification.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FMP_ANALYST_ESTIMATES_LIMIT = 10

async function fetchQuoteRowOnly(symbol: string, apiKey: string): Promise<JsonRecord | undefined> {
  const q = encodeURIComponent(symbol.toUpperCase())
  const raw = await fmpGet<unknown>(`/stable/quote?symbol=${q}`, apiKey)
  if (fmpPayloadHasErrorMessage(raw)) return undefined
  return firstRow(asArray<JsonRecord>(raw))
}

async function fetchAnalystEstimatesAnnual(symbol: string, apiKey: string): Promise<JsonRecord[]> {
  const q = encodeURIComponent(symbol.toUpperCase())
  const raw = await fmpGet<unknown>(
    `/stable/analyst-estimates?symbol=${q}&period=annual&limit=${FMP_ANALYST_ESTIMATES_LIMIT}`,
    apiKey,
  )
  return asArray<JsonRecord>(raw)
}

async function fetchAnalystEstimatesQuarterly(symbol: string, apiKey: string): Promise<JsonRecord[]> {
  const q = encodeURIComponent(symbol.toUpperCase())
  try {
    const raw = await fmpGet<unknown>(
      `/stable/analyst-estimates?symbol=${q}&period=quarter&limit=${FMP_ANALYST_ESTIMATES_LIMIT}`,
      apiKey,
    )
    return asArray<JsonRecord>(raw)
  } catch {
    return []
  }
}

function mergeQuoteIntoPack(pack: CompanyRawPack, quote: JsonRecord | undefined): CompanyRawPack {
  if (!quote) return pack
  return { ...pack, quote }
}

type CacheRow = HomeCacheRowInput & {
  profile_cache_key: string
  symbol: string
}

type BundleMeta = {
  pack: 'db' | 'fmp'
  quote: 'db' | 'fmp' | 'none'
  peers: 'db' | 'fmp' | 'skipped'
  forward_growth: 'db' | 'db_stale' | 'pack' | 'fmp' | 'none'
  refresh_recommended: boolean
  stale_slices: HomeCacheSliceId[]
  in_flight: boolean
  fetched_at: {
    pack: string | null
    quote: string | null
    peers: string | null
    forward_growth: string | null
  }
  ages_ms: Record<string, number | undefined>
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function rebuildForwardFromPack(symbol: string, p: CompanyRawPack): ForwardGrowthCharts | undefined {
  return buildForwardGrowthChartsFromPack(
    symbol,
    p.analystEstimates,
    p.incomeAnnual,
    p.incomeQuarterly ?? [],
    p.analystEstimatesQuarterly ?? [],
  )
}

async function readScreenScoresExtras(
  sb: SupabaseClient,
  symbol: string,
): Promise<{ forward_rev_cagr_3y: number | null; forward_growth_score: number | null; updated_at: string | null }> {
  const { data } = await sb
    .from('screen_scores')
    .select('forward_rev_cagr_3y, forward_growth_score, updated_at')
    .eq('symbol', symbol)
    .maybeSingle()
  return {
    forward_rev_cagr_3y: typeof data?.forward_rev_cagr_3y === 'number' ? data.forward_rev_cagr_3y : null,
    forward_growth_score:
      typeof data?.forward_growth_score === 'number' ? Math.round(data.forward_growth_score) : null,
    updated_at: typeof data?.updated_at === 'string' ? data.updated_at : null,
  }
}

async function upsertScreenScoresCagr(
  sb: SupabaseClient,
  symbol: string,
  cagr: number | undefined,
  charts: ForwardGrowthCharts | undefined,
): Promise<number | null> {
  if (cagr === undefined) return null

  const { data: existing } = await sb.from('screen_scores').select('symbol').eq('symbol', symbol).maybeSingle()

  if (existing) {
    await sb
      .from('screen_scores')
      .update({
        forward_rev_cagr_3y: cagr,
        forward_growth_score: null,
        updated_at: new Date().toISOString(),
      })
      .eq('symbol', symbol)
  }

  clearForwardGrowthCagrUniverseCache()
  await recomputeForwardGrowthPercentiles(sb)

  const universe = await fetchForwardGrowthCagrUniverse(sb)
  return forwardGrowthScoreFromCharts(symbol, charts, universe)
}

function rowInputFromCache(row: CacheRow | null): HomeCacheRowInput {
  return {
    company_raw_pack: row?.company_raw_pack ?? null,
    company_raw_pack_fetched_at: row?.company_raw_pack_fetched_at ?? null,
    quote_row: row?.quote_row ?? null,
    quote_fetched_at: row?.quote_fetched_at ?? null,
    peer_medians: row?.peer_medians ?? null,
    peer_medians_fetched_at: row?.peer_medians_fetched_at ?? null,
    forward_growth_charts: row?.forward_growth_charts ?? null,
    forward_growth_fetched_at: row?.forward_growth_fetched_at ?? null,
    lock_until: row?.lock_until ?? null,
    forward_rev_cagr_3y: row?.forward_rev_cagr_3y ?? null,
    screen_scores_updated_at: row?.screen_scores_updated_at ?? null,
  }
}

function buildMeta(
  row: HomeCacheRowInput,
  opts: { fetchPeers: boolean; forceRefresh: boolean },
  forwardGrowth: ForwardGrowthCharts | undefined,
): BundleMeta {
  const { stale } = planHomeCacheRefresh(row, opts)
  const forwardUsable = forwardGrowthChartsUsable(forwardGrowth)
  const forwardComplete = forwardGrowthChartsComplete(forwardGrowth)
  let forwardMeta: BundleMeta['forward_growth'] = 'none'
  if (forwardComplete) forwardMeta = stale.includes('forward_growth') ? 'db_stale' : 'db'
  else if (forwardUsable) forwardMeta = 'db_stale'
  else forwardMeta = 'none'

  return {
    pack: row.company_raw_pack ? 'db' : 'db',
    quote: row.quote_row ? 'db' : 'none',
    peers: opts.fetchPeers ? (row.peer_medians && row.peer_medians.n > 0 ? 'db' : 'db') : 'skipped',
    forward_growth: forwardMeta,
    refresh_recommended: stale.length > 0,
    stale_slices: stale,
    in_flight: refreshLockActive(row.lock_until),
    fetched_at: {
      pack: row.company_raw_pack_fetched_at,
      quote: row.quote_fetched_at,
      peers: row.peer_medians_fetched_at,
      forward_growth: row.forward_growth_fetched_at,
    },
    ages_ms: buildHomeCacheAges(row),
  }
}

async function loadBundleFromDb(
  sb: SupabaseClient,
  row: CacheRow | null,
  symbol: string,
  fetchPeers: boolean,
): Promise<{
  pack: CompanyRawPack | null
  peerMedians: PeerMedians
  forwardGrowth: ForwardGrowthCharts | undefined
  forwardGrowthScore: number | null
}> {
  const screen = await readScreenScoresExtras(sb, symbol)
  const input = rowInputFromCache(row)
  input.forward_rev_cagr_3y = screen.forward_rev_cagr_3y
  input.screen_scores_updated_at = screen.updated_at

  let pack = row?.company_raw_pack ?? null
  let forwardGrowth = row?.forward_growth_charts ?? undefined

  if (pack && !forwardGrowthChartsComplete(forwardGrowth)) {
    const built = rebuildForwardFromPack(symbol, pack)
    if (forwardGrowthChartsUsable(built)) forwardGrowth = built
  }

  let forwardGrowthScore = screen.forward_growth_score
  if (
    (forwardGrowthScore == null || forwardGrowthScore < 1) &&
    forwardGrowthChartsComplete(forwardGrowth)
  ) {
    try {
      const universe = await fetchForwardGrowthCagrUniverse(sb)
      forwardGrowthScore = forwardGrowthScoreFromCharts(symbol, forwardGrowth, universe)
    } catch {
      forwardGrowthScore = null
    }
  }

  const peerMedians = fetchPeers ? (row?.peer_medians ?? EMPTY_PEER_MEDIANS) : EMPTY_PEER_MEDIANS
  return { pack, peerMedians, forwardGrowth, forwardGrowthScore }
}

async function persistCache(
  sb: SupabaseClient,
  profileCacheKey: string,
  symbol: string,
  pack: CompanyRawPack | null,
  packAt: string | null,
  quoteRow: JsonRecord | undefined,
  quoteAt: string | null,
  peerMedians: PeerMedians,
  peerAt: string | null,
  forwardGrowth: ForwardGrowthCharts | undefined,
  forwardAt: string | null,
  lockUntil: string | null,
): Promise<void> {
  const { error } = await sb.from('ticker_fmp_home_cache').upsert(
    {
      profile_cache_key: profileCacheKey,
      symbol,
      company_raw_pack: pack,
      company_raw_pack_fetched_at: packAt,
      quote_row: quoteRow ?? null,
      quote_fetched_at: quoteAt,
      peer_medians: peerMedians,
      peer_medians_fetched_at: peerAt,
      forward_growth_charts: forwardGrowth ?? null,
      forward_growth_fetched_at: forwardAt,
      lock_until: lockUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_cache_key' },
  )
  if (error) throw new Error(error.message)
}

async function runStaleRefresh(
  sb: SupabaseClient,
  fmpKey: string,
  profileCacheKey: string,
  symbol: string,
  fetchPeers: boolean,
  forceRefresh: boolean,
  row: CacheRow | null,
): Promise<{
  pack: CompanyRawPack
  peerMedians: PeerMedians
  forwardGrowth: ForwardGrowthCharts | undefined
  forwardGrowthScore: number | null
  refreshed: HomeCacheSliceId[]
}> {
  const screen = await readScreenScoresExtras(sb, symbol)
  const input = rowInputFromCache(row)
  input.forward_rev_cagr_3y = screen.forward_rev_cagr_3y
  input.screen_scores_updated_at = screen.updated_at

  const { stale } = planHomeCacheRefresh(input, { fetchPeers, forceRefresh })
  const refreshed: HomeCacheSliceId[] = []

  let pack: CompanyRawPack | null = row?.company_raw_pack ?? null
  let packAt = row?.company_raw_pack_fetched_at ?? null
  let quoteRow: JsonRecord | undefined = row?.quote_row ?? undefined
  let quoteAt = row?.quote_fetched_at ?? null
  let peerMedians: PeerMedians = row?.peer_medians ?? EMPTY_PEER_MEDIANS
  let peerAt = row?.peer_medians_fetched_at ?? null
  let forwardGrowth: ForwardGrowthCharts | undefined = row?.forward_growth_charts ?? undefined
  let forwardAt = row?.forward_growth_fetched_at ?? null

  if (stale.includes('pack')) {
    pack = await fetchCompanyRawPack(symbol, fmpKey)
    packAt = new Date().toISOString()
    quoteRow = pack.quote ?? undefined
    quoteAt = packAt
    refreshed.push('pack')
  }

  if (stale.includes('quote') && pack) {
    const qRow = await fetchQuoteRowOnly(symbol, fmpKey)
    quoteAt = new Date().toISOString()
    quoteRow = qRow ?? quoteRow
    pack = mergeQuoteIntoPack(pack, quoteRow)
    refreshed.push('quote')
  }

  if (stale.includes('pack') && pack && (pack.analystEstimates?.length ?? 0) === 0) {
    pack = {
      ...pack,
      analystEstimates: await fetchAnalystEstimatesAnnual(symbol, fmpKey),
      analystEstimatesQuarterly: await fetchAnalystEstimatesQuarterly(symbol, fmpKey),
    }
  }

  if (stale.includes('forward_growth') && pack) {
    const built = rebuildForwardFromPack(symbol, pack)
    if (!forwardGrowthChartsUsable(built)) {
      const annual = await fetchAnalystEstimatesAnnual(symbol, fmpKey)
      const quarterly = await fetchAnalystEstimatesQuarterly(symbol, fmpKey)
      pack = {
        ...pack,
        analystEstimates: annual.length > 0 ? annual : pack.analystEstimates,
        analystEstimatesQuarterly: quarterly.length > 0 ? quarterly : pack.analystEstimatesQuarterly ?? [],
      }
      const retry = rebuildForwardFromPack(symbol, pack)
      if (forwardGrowthChartsUsable(retry)) forwardGrowth = retry
    } else {
      forwardGrowth = built
    }
    if (forwardGrowthChartsUsable(forwardGrowth)) {
      forwardAt = new Date().toISOString()
      refreshed.push('forward_growth')
    }
  }

  if (fetchPeers && stale.includes('peers') && pack) {
    peerMedians = await fetchPeerMedians(pack.peers ?? [], fmpKey, { subjectSymbol: symbol })
    peerAt = new Date().toISOString()
    refreshed.push('peers')
  }

  if (!pack) {
    throw new Error('No company pack available after refresh')
  }

  let forwardGrowthScore: number | null = screen.forward_growth_score
  const cagr = forwardRevenueCagrFromCharts(forwardGrowth)
  if (stale.includes('screen_scores') || stale.includes('forward_growth') || cagr !== undefined) {
    forwardGrowthScore = await upsertScreenScoresCagr(sb, symbol, cagr, forwardGrowth)
    if (refreshed.length === 0 || !refreshed.includes('screen_scores')) {
      refreshed.push('screen_scores')
    }
  } else if (forwardGrowthChartsComplete(forwardGrowth)) {
    try {
      const universe = await fetchForwardGrowthCagrUniverse(sb)
      forwardGrowthScore = forwardGrowthScoreFromCharts(symbol, forwardGrowth, universe)
    } catch {
      forwardGrowthScore = null
    }
  }

  await persistCache(
    sb,
    profileCacheKey,
    symbol,
    pack,
    packAt,
    quoteRow,
    quoteAt,
    peerMedians,
    peerAt,
    forwardGrowth,
    forwardAt,
    null,
  )

  return { pack, peerMedians, forwardGrowth, forwardGrowthScore, refreshed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const fmpKey = Deno.env.get('FMP_API_KEY')?.trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!fmpKey || !supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Server misconfigured (FMP or Supabase secrets).' }, 500)
  }

  let body: {
    profile_cache_key?: string
    symbol?: string
    fetch_peers?: boolean
    force_refresh?: boolean
    refresh_forward_growth?: boolean
    mode?: 'bundle' | 'refresh'
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const profileCacheKey = typeof body.profile_cache_key === 'string' ? body.profile_cache_key.trim() : ''
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const fetchPeers = body.fetch_peers !== false
  const forceRefresh = body.force_refresh === true
  const mode = body.mode === 'refresh' ? 'refresh' : body.refresh_forward_growth ? 'refresh' : 'bundle'

  if (!profileCacheKey || profileCacheKey.length > 512 || !symbol || !/^[A-Z0-9.-]{1,12}$/.test(symbol)) {
    return jsonResponse({ error: 'Invalid profile_cache_key or symbol' }, 400)
  }

  const sb = createClient(supabaseUrl, serviceKey)

  const { data: existing, error: readErr } = await sb
    .from('ticker_fmp_home_cache')
    .select('*')
    .eq('profile_cache_key', profileCacheKey)
    .maybeSingle()

  if (readErr) {
    return jsonResponse({ error: readErr.message }, 500)
  }

  const row = existing as CacheRow | null

  if (mode === 'refresh') {
    if (refreshLockActive(row?.lock_until)) {
      const loaded = await loadBundleFromDb(sb, row, symbol, fetchPeers)
      if (!loaded.pack) {
        return jsonResponse({ error: 'No cached company pack; load ticker first.' }, 400)
      }
      const input = rowInputFromCache(row)
      const meta = buildMeta(input, { fetchPeers, forceRefresh: false }, loaded.forwardGrowth)
      meta.in_flight = true
      return jsonResponse({
        ok: true,
        done: false,
        in_flight: true,
        pack: loaded.pack,
        peer_medians: loaded.peerMedians,
        forward_growth: loaded.forwardGrowth,
        forward_growth_score: loaded.forwardGrowthScore,
        meta,
      })
    }

    const lockUntil = new Date(Date.now() + REFRESH_LOCK_MS).toISOString()
    await persistCache(
      sb,
      profileCacheKey,
      symbol,
      row?.company_raw_pack ?? null,
      row?.company_raw_pack_fetched_at ?? null,
      row?.quote_row ?? undefined,
      row?.quote_fetched_at ?? null,
      row?.peer_medians ?? EMPTY_PEER_MEDIANS,
      row?.peer_medians_fetched_at ?? null,
      row?.forward_growth_charts ?? undefined,
      row?.forward_growth_fetched_at ?? null,
      lockUntil,
    )

    try {
      const result = await runStaleRefresh(sb, fmpKey, profileCacheKey, symbol, fetchPeers, forceRefresh, row)
      const input = rowInputFromCache(row)
      const meta = buildMeta(input, { fetchPeers, forceRefresh: false }, result.forwardGrowth)
      meta.refresh_recommended = false
      meta.stale_slices = []
      meta.in_flight = false
      meta.pack = refreshedIncludes(result.refreshed, 'pack') ? 'fmp' : meta.pack
      if (refreshedIncludes(result.refreshed, 'forward_growth')) {
        meta.forward_growth = 'fmp'
      }

      return jsonResponse({
        ok: true,
        done: true,
        refreshed: result.refreshed,
        pack: result.pack,
        peer_medians: result.peerMedians,
        forward_growth: forwardGrowthChartsUsable(result.forwardGrowth) ? result.forwardGrowth : undefined,
        forward_growth_score: result.forwardGrowthScore,
        meta,
      })
    } catch (e) {
      await persistCache(
        sb,
        profileCacheKey,
        symbol,
        row?.company_raw_pack ?? null,
        row?.company_raw_pack_fetched_at ?? null,
        row?.quote_row ?? undefined,
        row?.quote_fetched_at ?? null,
        row?.peer_medians ?? EMPTY_PEER_MEDIANS,
        row?.peer_medians_fetched_at ?? null,
        row?.forward_growth_charts ?? undefined,
        row?.forward_growth_fetched_at ?? null,
        null,
      )
      return jsonResponse(
        { error: e instanceof Error ? e.message : 'Refresh failed' },
        500,
      )
    }
  }

  const loaded = await loadBundleFromDb(sb, row, symbol, fetchPeers)
  if (!loaded.pack) {
    return jsonResponse({
      ok: true,
      pack: null,
      refresh_recommended: true,
      meta: buildMeta(rowInputFromCache(row), { fetchPeers, forceRefresh }, undefined),
    })
  }

  const input = rowInputFromCache(row)
  const meta = buildMeta(input, { fetchPeers, forceRefresh }, loaded.forwardGrowth)

  return jsonResponse({
    ok: true,
    pack: loaded.pack,
    peer_medians: loaded.peerMedians,
    forward_growth: forwardGrowthChartsUsable(loaded.forwardGrowth) ? loaded.forwardGrowth : undefined,
    forward_growth_score: loaded.forwardGrowthScore,
    meta,
  })
})

function refreshedIncludes(refreshed: HomeCacheSliceId[], slice: HomeCacheSliceId): boolean {
  return refreshed.includes(slice)
}
