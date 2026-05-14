import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
// FMP helpers in ./_shared are copies of src/lib/fmp/* — run `npm run sync:edge-fmp-shared` after changing those modules.
import { fetchCompanyRawPack } from './_shared/fetchCompanyRawPack.ts'
import { fetchPeerMedians, EMPTY_PEER_MEDIANS } from './_shared/peerMedians.ts'
import type { CompanyRawPack } from './_shared/fetchCompanyRawPack.ts'
import type { PeerMedians } from './_shared/peerMedians.ts'
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const fmpKey = Deno.env.get('FMP_API_KEY')?.trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!fmpKey || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured (FMP or Supabase secrets).' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: {
    profile_cache_key?: string
    symbol?: string
    fetch_peers?: boolean
    force_refresh?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const profileCacheKey = typeof body.profile_cache_key === 'string' ? body.profile_cache_key.trim() : ''
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  const fetchPeers = body.fetch_peers !== false
  const forceRefresh = body.force_refresh === true

  if (!profileCacheKey || profileCacheKey.length > 512 || !symbol || !/^[A-Z0-9.-]{1,12}$/.test(symbol)) {
    return new Response(JSON.stringify({ error: 'Invalid profile_cache_key or symbol' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sb = createClient(supabaseUrl, serviceKey)

  const meta: {
    pack: 'db' | 'fmp'
    quote: 'db' | 'fmp' | 'none'
    peers: 'db' | 'fmp' | 'skipped'
    fetched_at: { pack: string | null; quote: string | null; peers: string | null }
  } = {
    pack: 'db',
    quote: 'none',
    peers: fetchPeers ? 'db' : 'skipped',
    fetched_at: { pack: null, quote: null, peers: null },
  }

  const { data: existing, error: readErr } = await sb
    .from('ticker_fmp_home_cache')
    .select('*')
    .eq('profile_cache_key', profileCacheKey)
    .maybeSingle()

  if (readErr) {
    return new Response(JSON.stringify({ error: readErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const row = existing as CacheRow | null

  let pack: CompanyRawPack | null = row?.company_raw_pack ?? null
  let packAt = row?.company_raw_pack_fetched_at ?? null
  let quoteRow: JsonRecord | undefined = row?.quote_row ?? undefined
  let quoteAt = row?.quote_fetched_at ?? null
  let peerMed: PeerMedians | null = row?.peer_medians ?? null
  let peerAt = row?.peer_medians_fetched_at ?? null

  const packStale = forceRefresh || !pack || msSince(packAt) > TTL_PACK_MS
  const quoteStale = forceRefresh || !quoteAt || msSince(quoteAt) > TTL_QUOTE_MS
  const peersStale =
    fetchPeers &&
    (forceRefresh ||
      !peerMed ||
      peerMed.n === 0 ||
      msSince(peerAt) > TTL_PEER_MS ||
      (!!packAt && !!peerAt && new Date(peerAt).getTime() < new Date(packAt).getTime()))

  if (packStale) {
    pack = await fetchCompanyRawPack(symbol, fmpKey)
    packAt = new Date().toISOString()
    quoteRow = pack.quote ?? undefined
    quoteAt = packAt
    meta.pack = 'fmp'
    meta.quote = quoteRow ? 'fmp' : 'none'
    meta.fetched_at.pack = packAt
    meta.fetched_at.quote = quoteAt
  } else if (quoteStale) {
    const qRow = await fetchQuoteRowOnly(symbol, fmpKey)
    quoteAt = new Date().toISOString()
    quoteRow = qRow ?? quoteRow
    meta.quote = qRow ? 'fmp' : 'db'
    meta.fetched_at.pack = packAt
    meta.fetched_at.quote = quoteAt
    pack = mergeQuoteIntoPack(pack as CompanyRawPack, quoteRow)
  } else {
    meta.pack = 'db'
    meta.quote = quoteRow ? 'db' : 'none'
    meta.fetched_at.pack = packAt
    meta.fetched_at.quote = quoteAt
    pack = mergeQuoteIntoPack(pack as CompanyRawPack, quoteRow)
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
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_cache_key' },
  )

  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pack,
      peer_medians: outPeers,
      meta,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
