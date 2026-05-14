import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyRawPack } from './fetchCompanyRawPack'
import type { PeerMedians } from './peerMedians'

/** Short client throttle so React strict mode / re-renders do not hammer the Edge Function + DB. */
export const HOME_FMP_EDGE_CLIENT_THROTTLE_MS = 90_000

export type HomeFmpEdgeMeta = {
  pack: 'db' | 'fmp'
  quote: 'db' | 'fmp' | 'none'
  peers: 'db' | 'fmp' | 'skipped'
  fetched_at: { pack: string | null; quote: string | null; peers: string | null }
}

export type HomeFmpEdgeBundle = {
  pack: CompanyRawPack
  peer_medians: PeerMedians
  meta: HomeFmpEdgeMeta
}

const throttle = new Map<string, { savedAt: number; bundle: HomeFmpEdgeBundle }>()

function edgeThrottleKey(profileCacheKey: string, fetchPeers: boolean): string {
  return `${profileCacheKey}|peers:${fetchPeers ? '1' : '0'}`
}

/**
 * Whether the app should call the `home-fmp-cache` Edge Function (writes/read Postgres).
 * Requires both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same as browser client).
 * - `VITE_HOME_FMP_CACHE=false` or `0` → off.
 * - Otherwise → on (including unset), so Supabase-backed home cache runs once Edge is deployed.
 */
export function shouldUseHomeFmpEdgeCache(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) return false
  const v = import.meta.env.VITE_HOME_FMP_CACHE
  if (v === 'false' || v === '0') return false
  return true
}

/**
 * Loads FMP company pack + peer medians through the `home-fmp-cache` Edge Function (Postgres staleness).
 * Returns null to fall back to browser FMP (e.g. function not deployed or invoke error).
 */
export async function fetchHomeFmpBundleViaEdge(options: {
  supabase: SupabaseClient
  profileCacheKey: string
  symbol: string
  fetchPeers: boolean
  forceRefresh: boolean
}): Promise<HomeFmpEdgeBundle | null> {
  if (!shouldUseHomeFmpEdgeCache()) return null

  const { supabase, profileCacheKey, symbol, fetchPeers, forceRefresh } = options
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
      force_refresh: forceRefresh,
    },
  })

  if (error) {
    console.warn('[home-fmp-cache]', error.message)
    return null
  }

  const body = data as {
    ok?: boolean
    pack?: CompanyRawPack
    peer_medians?: PeerMedians
    meta?: HomeFmpEdgeMeta
    error?: string
  }
  if (!body?.ok || !body.pack || !body.meta) {
    if (body?.error) console.warn('[home-fmp-cache]', body.error)
    return null
  }

  const bundle: HomeFmpEdgeBundle = {
    pack: body.pack,
    peer_medians: body.peer_medians ?? { n: 0 },
    meta: body.meta,
  }
  throttle.set(tKey, { savedAt: Date.now(), bundle })
  return bundle
}

/** Use server quote_fetched_at for delayed price display when present. */
export function quoteSnapshotMsFromEdgeMeta(meta: HomeFmpEdgeMeta | null | undefined): number | undefined {
  if (!meta) return undefined
  const iso = meta.fetched_at.quote ?? meta.fetched_at.pack
  if (!iso) return undefined
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : undefined
}
