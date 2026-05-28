import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyRawPack } from './fetchCompanyRawPack'
import type { PeerMedians } from './peerMedians'
import { forwardGrowthChartsComplete, type ForwardGrowthCharts } from './parseForwardEstimates'
import type { HomeCacheSliceId } from './homeCachePlan'

/** Short client throttle so React strict mode / re-renders do not hammer the Edge Function + DB. */
export const HOME_FMP_EDGE_CLIENT_THROTTLE_MS = 90_000

export type HomeFmpForwardGrowthMeta = 'db' | 'db_stale' | 'pack' | 'fmp' | 'none' | 'skipped'

export type HomeFmpEdgeMeta = {
  pack: 'db' | 'fmp'
  quote: 'db' | 'fmp' | 'none'
  peers: 'db' | 'fmp' | 'skipped'
  forward_growth: HomeFmpForwardGrowthMeta
  refresh_recommended: boolean
  stale_slices: HomeCacheSliceId[]
  in_flight: boolean
  fetched_at: {
    pack: string | null
    quote: string | null
    peers: string | null
    forward_growth: string | null
  }
  ages_ms?: Record<string, number | undefined>
}

export type HomeFmpEdgeBundle = {
  pack: CompanyRawPack
  peer_medians: PeerMedians
  forward_growth?: ForwardGrowthCharts
  forward_growth_score?: number | null
  meta: HomeFmpEdgeMeta
}

const throttle = new Map<string, { savedAt: number; bundle: HomeFmpEdgeBundle }>()

function edgeThrottleKey(profileCacheKey: string, fetchPeers: boolean): string {
  return `${profileCacheKey}|peers:${fetchPeers ? '1' : '0'}`
}

/**
 * Whether the app should call the `home-fmp-cache` Edge Function (writes/read Postgres).
 */
export function shouldUseHomeFmpEdgeCache(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) return false
  const v = import.meta.env.VITE_HOME_FMP_CACHE
  if (v === 'false' || v === '0') return false
  return true
}

type EdgeInvokeBody = {
  ok?: boolean
  pack?: CompanyRawPack | null
  peer_medians?: PeerMedians
  forward_growth?: ForwardGrowthCharts
  forward_growth_score?: number | null
  meta?: HomeFmpEdgeMeta
  error?: string
  done?: boolean
  in_flight?: boolean
  refreshed?: HomeCacheSliceId[]
}

function parseEdgeBody(data: unknown): EdgeInvokeBody {
  return (data ?? {}) as EdgeInvokeBody
}

function normalizeMeta(raw: EdgeInvokeBody['meta']): HomeFmpEdgeMeta {
  return {
    pack: raw?.pack ?? 'db',
    quote: raw?.quote ?? 'none',
    peers: raw?.peers ?? 'skipped',
    forward_growth: raw?.forward_growth ?? 'none',
    refresh_recommended: raw?.refresh_recommended ?? false,
    stale_slices: raw?.stale_slices ?? [],
    in_flight: raw?.in_flight ?? false,
    fetched_at: raw?.fetched_at ?? {
      pack: null,
      quote: null,
      peers: null,
      forward_growth: null,
    },
    ages_ms: raw?.ages_ms,
  }
}

/**
 * DB-only bundle (fast). Does not call FMP synchronously; use `refreshHomeFmpTickerViaEdge` when stale.
 */
export async function fetchHomeFmpBundleViaEdge(options: {
  supabase: SupabaseClient
  profileCacheKey: string
  symbol: string
  fetchPeers: boolean
  forceRefresh?: boolean
}): Promise<HomeFmpEdgeBundle | null> {
  if (!shouldUseHomeFmpEdgeCache()) return null

  const { supabase, profileCacheKey, symbol, fetchPeers, forceRefresh = false } = options
  const tKey = edgeThrottleKey(profileCacheKey, fetchPeers)
  if (!forceRefresh) {
    const hit = throttle.get(tKey)
    if (hit && Date.now() - hit.savedAt < HOME_FMP_EDGE_CLIENT_THROTTLE_MS) {
      return hit.bundle
    }
  }

  const { data, error } = await supabase.functions.invoke('home-fmp-cache', {
    body: {
      profile_cache_key: profileCacheKey,
      symbol,
      fetch_peers: fetchPeers,
      force_refresh: false,
      mode: 'bundle',
    },
  })

  if (error) {
    console.warn('[home-fmp-cache]', error.message)
    return null
  }

  const body = parseEdgeBody(data)
  if (!body.ok || !body.pack || !body.meta) {
    if (body.error) console.warn('[home-fmp-cache]', body.error)
    return null
  }

  const bundle: HomeFmpEdgeBundle = {
    pack: body.pack,
    peer_medians: body.peer_medians ?? { n: 0 },
    forward_growth: body.forward_growth,
    forward_growth_score: body.forward_growth_score ?? null,
    meta: normalizeMeta(body.meta),
  }
  throttle.set(tKey, { savedAt: Date.now(), bundle })
  return bundle
}

export type HomeFmpRefreshResult = {
  pack: CompanyRawPack
  peer_medians: PeerMedians
  forward_growth?: ForwardGrowthCharts
  forward_growth_score: number | null
  meta: HomeFmpEdgeMeta
  refreshed: HomeCacheSliceId[]
}

/**
 * Refresh stale slices for one ticker (FMP + DB). Call after showing cached bundle.
 */
export async function refreshHomeFmpTickerViaEdge(options: {
  supabase: SupabaseClient
  profileCacheKey: string
  symbol: string
  fetchPeers: boolean
  forceRefresh?: boolean
}): Promise<HomeFmpRefreshResult | null> {
  if (!shouldUseHomeFmpEdgeCache()) return null

  const { data, error } = await options.supabase.functions.invoke('home-fmp-cache', {
    body: {
      profile_cache_key: options.profileCacheKey,
      symbol: options.symbol,
      fetch_peers: options.fetchPeers,
      force_refresh: options.forceRefresh === true,
      mode: 'refresh',
    },
  })

  if (error) {
    console.warn('[home-fmp-cache refresh]', error.message)
    return null
  }

  const body = parseEdgeBody(data)
  if (!body.ok || !body.pack) {
    if (body.error) console.warn('[home-fmp-cache refresh]', body.error)
    return null
  }

  const meta = normalizeMeta(body.meta)
  const result: HomeFmpRefreshResult = {
    pack: body.pack,
    peer_medians: body.peer_medians ?? { n: 0 },
    forward_growth: body.forward_growth,
    forward_growth_score: body.forward_growth_score ?? null,
    meta,
    refreshed: body.refreshed ?? [],
  }

  const tKey = edgeThrottleKey(options.profileCacheKey, options.fetchPeers)
  throttle.set(tKey, {
    savedAt: Date.now(),
    bundle: {
      pack: result.pack,
      peer_medians: result.peer_medians,
      forward_growth: result.forward_growth,
      forward_growth_score: result.forward_growth_score,
      meta: result.meta,
    },
  })

  return result
}

/** @deprecated Use refreshHomeFmpTickerViaEdge */
export async function refreshForwardGrowthChartsViaEdge(options: {
  supabase: SupabaseClient
  profileCacheKey: string
  symbol: string
}): Promise<ForwardGrowthCharts | null> {
  const result = await refreshHomeFmpTickerViaEdge({
    ...options,
    fetchPeers: false,
    forceRefresh: false,
  })
  return result?.forward_growth ?? null
}

export function quoteSnapshotMsFromEdgeMeta(meta: HomeFmpEdgeMeta | null | undefined): number | undefined {
  if (!meta) return undefined
  const iso = meta.fetched_at.quote ?? meta.fetched_at.pack
  if (!iso) return undefined
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : undefined
}

export function forwardGrowthNeedsBackgroundRefresh(
  meta: HomeFmpEdgeMeta | null | undefined,
  charts: ForwardGrowthCharts | undefined,
): boolean {
  if (!meta) return false
  if (meta.refresh_recommended) return true
  if (meta.in_flight) return false
  if (!forwardGrowthChartsComplete(charts)) return true
  if (meta.forward_growth === 'db_stale') return true
  if (meta.forward_growth === 'none') return true
  return false
}
