import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
// FMP helpers in ./_shared are copies of src/lib/fmp/* — run `npm run sync:edge-fmp-shared` after changing those modules.
import { fetchCompanyRawPack } from './_shared/fetchCompanyRawPack.ts'
import { fetchPeerMedians, EMPTY_PEER_MEDIANS } from './_shared/peerMedians.ts'
import type { CompanyRawPack } from './_shared/fetchCompanyRawPack.ts'
import type { PeerMedians } from './_shared/peerMedians.ts'
import {
  buildForwardGrowthChartsFromPack,
  forwardGrowthChartsUsable,
  type ForwardGrowthCharts,
} from './_shared/parseForwardEstimates.ts'
import { fmpGet } from './_shared/http.ts'
import { asArray, firstRow, type JsonRecord } from './_shared/normalize.ts'
import { fmpPayloadHasErrorMessage } from './_shared/profileClassification.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TTL_PACK_MS = 72 * 60 * 60 * 1000
const TTL_QUOTE_MS = 60 * 60 * 1000
const TTL_PEER_MS = 30 * 24 * 60 * 60 * 1000
const TTL_FORWARD_MS = 24 * 60 * 60 * 1000
const FMP_ANALYST_ESTIMATES_LIMIT = 10

function msSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? Date.now() - t : Infinity
}

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
  const raw = await fmpGet<unknown>(
    `/stable/analyst-estimates?symbol=${q}&period=quarter&limit=${FMP_ANALYST_ESTIMATES_LIMIT}`,
    apiKey,
  )
  return asArray<JsonRecord>(raw)
}

function mergeQuoteIntoPack(pack: CompanyRawPack, quote: JsonRecord | undefined): CompanyRawPack {
  if (!quote) return pack
  return { ...pack, quote }
}

type CacheRow = {
  profile_cache_key: string
  symbol: string
  company_raw_pack: CompanyRawPack | null
  company_raw_pack_fetched_at: string | null
  quote_row: JsonRecord | null
  quote_fetched_at: string | null
  peer_medians: PeerMedians | null
  peer_medians_fetched_at: string | null
  forward_growth_charts: ForwardGrowthCharts | null
  forward_growth_fetched_at: string | null
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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
  const refreshForwardOnly = body.refresh_forward_growth === true

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

  if (refreshForwardOnly) {
    const pack = row?.company_raw_pack
    if (!pack?.incomeAnnual?.length) {
      return jsonResponse({ error: 'No cached company pack; load ticker first.' }, 400)
    }

    let analystRows = pack.analystEstimates ?? []
    let forwardMeta: 'fmp' | 'pack' = 'pack'
    let analystQuarterly = pack.analystEstimatesQuarterly ?? []
    const builtFromPack = buildForwardGrowthChartsFromPack(
      symbol,
      analystRows,
      pack.incomeAnnual,
      pack.incomeQuarterly ?? [],
      analystQuarterly,
    )
    let charts = forwardGrowthChartsUsable(builtFromPack) ? builtFromPack : undefined

    if (!charts) {
      analystRows = await fetchAnalystEstimatesAnnual(symbol, fmpKey)
      analystQuarterly = await fetchAnalystEstimatesQuarterly(symbol, fmpKey)
      forwardMeta = 'fmp'
      charts = buildForwardGrowthChartsFromPack(
        symbol,
        analystRows,
        pack.incomeAnnual,
        pack.incomeQuarterly ?? [],
        analystQuarterly,
      )
    }

    if (!forwardGrowthChartsUsable(charts)) {
      return jsonResponse({ ok: true, forward_growth: null, meta: { forward_growth: 'none' } })
    }

    const forwardAt = new Date().toISOString()
    const { error: upErr } = await sb.from('ticker_fmp_home_cache').upsert(
      {
        profile_cache_key: profileCacheKey,
        symbol,
        forward_growth_charts: charts,
        forward_growth_fetched_at: forwardAt,
        updated_at: forwardAt,
      },
      { onConflict: 'profile_cache_key' },
    )
    if (upErr) return jsonResponse({ error: upErr.message }, 500)

    return jsonResponse({
      ok: true,
      forward_growth: charts,
      meta: {
        forward_growth: forwardMeta,
        fetched_at: { forward_growth: forwardAt },
      },
    })
  }

  const meta: {
    pack: 'db' | 'fmp'
    quote: 'db' | 'fmp' | 'none'
    peers: 'db' | 'fmp' | 'skipped'
    forward_growth: 'db' | 'db_stale' | 'pack' | 'fmp' | 'none'
    fetched_at: {
      pack: string | null
      quote: string | null
      peers: string | null
      forward_growth: string | null
    }
  } = {
    pack: 'db',
    quote: 'none',
    peers: fetchPeers ? 'db' : 'skipped',
    forward_growth: 'none',
    fetched_at: { pack: null, quote: null, peers: null, forward_growth: null },
  }

  let pack: CompanyRawPack | null = row?.company_raw_pack ?? null
  let packAt = row?.company_raw_pack_fetched_at ?? null
  let quoteRow: JsonRecord | undefined = row?.quote_row ?? undefined
  let quoteAt = row?.quote_fetched_at ?? null
  let peerMed: PeerMedians | null = row?.peer_medians ?? null
  let peerAt = row?.peer_medians_fetched_at ?? null

  let forwardGrowth: ForwardGrowthCharts | undefined = row?.forward_growth_charts ?? undefined
  let forwardAt = row?.forward_growth_fetched_at ?? null

  const packStale = forceRefresh || !pack || msSince(packAt) > TTL_PACK_MS
  const quoteStale = forceRefresh || !quoteAt || msSince(quoteAt) > TTL_QUOTE_MS
  const peersStale =
    fetchPeers &&
    (forceRefresh ||
      !peerMed ||
      peerMed.n === 0 ||
      msSince(peerAt) > TTL_PEER_MS ||
      (!!packAt && !!peerAt && new Date(peerAt).getTime() < new Date(packAt).getTime()))

  const forwardStale =
    forceRefresh || !forwardGrowthChartsUsable(forwardGrowth) || msSince(forwardAt) > TTL_FORWARD_MS

  if (packStale) {
    pack = await fetchCompanyRawPack(symbol, fmpKey)
    packAt = new Date().toISOString()
    quoteRow = pack.quote ?? undefined
    quoteAt = packAt
    meta.pack = 'fmp'
    meta.quote = quoteRow ? 'fmp' : 'none'
    meta.fetched_at.pack = packAt
    meta.fetched_at.quote = quoteAt

    const built = buildForwardGrowthChartsFromPack(
      symbol,
      pack.analystEstimates,
      pack.incomeAnnual,
      pack.incomeQuarterly ?? [],
      pack.analystEstimatesQuarterly ?? [],
    )
    if (forwardGrowthChartsUsable(built)) {
      forwardGrowth = built
      forwardAt = packAt
      meta.forward_growth = 'fmp'
      meta.fetched_at.forward_growth = forwardAt
    } else {
      forwardGrowth = forwardGrowthChartsUsable(forwardGrowth) ? forwardGrowth : undefined
      meta.forward_growth = forwardGrowth
        ? forwardStale
          ? 'db_stale'
          : 'db'
        : 'none'
      meta.fetched_at.forward_growth = forwardAt
    }
  } else if (quoteStale) {
    const qRow = await fetchQuoteRowOnly(symbol, fmpKey)
    quoteAt = new Date().toISOString()
    quoteRow = qRow ?? quoteRow
    meta.quote = qRow ? 'fmp' : 'db'
    meta.fetched_at.pack = packAt
    meta.fetched_at.quote = quoteAt
    pack = mergeQuoteIntoPack(pack as CompanyRawPack, quoteRow)

    if (forwardGrowthChartsUsable(forwardGrowth)) {
      meta.forward_growth = forwardStale ? 'db_stale' : 'db'
      meta.fetched_at.forward_growth = forwardAt
    } else {
      const built = buildForwardGrowthChartsFromPack(
        symbol,
        (pack as CompanyRawPack).analystEstimates,
        (pack as CompanyRawPack).incomeAnnual,
        (pack as CompanyRawPack).incomeQuarterly ?? [],
        (pack as CompanyRawPack).analystEstimatesQuarterly ?? [],
      )
      if (forwardGrowthChartsUsable(built)) {
        forwardGrowth = built
        forwardAt = new Date().toISOString()
        meta.forward_growth = 'pack'
        meta.fetched_at.forward_growth = forwardAt
      } else {
        meta.forward_growth = 'none'
        meta.fetched_at.forward_growth = null
      }
    }
  } else {
    meta.pack = 'db'
    meta.quote = quoteRow ? 'db' : 'none'
    meta.fetched_at.pack = packAt
    meta.fetched_at.quote = quoteAt
    pack = mergeQuoteIntoPack(pack as CompanyRawPack, quoteRow)

    if (forwardGrowthChartsUsable(forwardGrowth)) {
      meta.forward_growth = forwardStale ? 'db_stale' : 'db'
      meta.fetched_at.forward_growth = forwardAt
    } else {
      const built = buildForwardGrowthChartsFromPack(
        symbol,
        (pack as CompanyRawPack).analystEstimates,
        (pack as CompanyRawPack).incomeAnnual,
        (pack as CompanyRawPack).incomeQuarterly ?? [],
        (pack as CompanyRawPack).analystEstimatesQuarterly ?? [],
      )
      if (forwardGrowthChartsUsable(built)) {
        forwardGrowth = built
        forwardAt = new Date().toISOString()
        meta.forward_growth = 'pack'
        meta.fetched_at.forward_growth = forwardAt
      } else {
        meta.forward_growth = 'none'
        meta.fetched_at.forward_growth = null
      }
    }
  }

  if (fetchPeers && peersStale) {
    peerMed = await fetchPeerMedians((pack as CompanyRawPack).peers ?? [], fmpKey, { subjectSymbol: symbol })
    peerAt = new Date().toISOString()
    meta.peers = 'fmp'
    meta.fetched_at.peers = peerAt
  } else if (fetchPeers && peerMed && peerMed.n > 0) {
    meta.peers = 'db'
    meta.fetched_at.peers = peerAt
  } else if (!fetchPeers) {
    meta.peers = 'skipped'
    meta.fetched_at.peers = peerAt
  } else {
    peerMed = EMPTY_PEER_MEDIANS
    meta.peers = 'fmp'
    meta.fetched_at.peers = peerAt
  }

  const outPeers = fetchPeers ? peerMed ?? EMPTY_PEER_MEDIANS : row?.peer_medians ?? EMPTY_PEER_MEDIANS
  const outPeersAt = fetchPeers ? peerAt : row?.peer_medians_fetched_at ?? peerAt

  const { error: upErr } = await sb.from('ticker_fmp_home_cache').upsert(
    {
      profile_cache_key: profileCacheKey,
      symbol,
      company_raw_pack: pack,
      company_raw_pack_fetched_at: packAt,
      quote_row: quoteRow ?? null,
      quote_fetched_at: quoteAt,
      peer_medians: outPeers,
      peer_medians_fetched_at: outPeersAt,
      forward_growth_charts: forwardGrowth ?? null,
      forward_growth_fetched_at: forwardAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_cache_key' },
  )

  if (upErr) {
    return jsonResponse({ error: upErr.message }, 500)
  }

  return jsonResponse({
    ok: true,
    pack,
    peer_medians: outPeers,
    forward_growth: forwardGrowthChartsUsable(forwardGrowth) ? forwardGrowth : undefined,
    meta,
  })
})
