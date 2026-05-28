import type { CompanyRawPack } from './fetchCompanyRawPack.ts'
import {
  forwardGrowthChartsComplete,
  forwardGrowthChartsUsable,
  type ForwardGrowthCharts,
} from './parseForwardEstimates.ts'
import type { PeerMedians } from './peerMedians.ts'

export type HomeCacheSliceId = 'pack' | 'quote' | 'peers' | 'forward_growth' | 'screen_scores'

export const TTL_PACK_MS = 72 * 60 * 60 * 1000
export const TTL_QUOTE_MS = 60 * 60 * 1000
export const TTL_PEER_MS = 30 * 24 * 60 * 60 * 1000
export const TTL_FORWARD_MS = 24 * 60 * 60 * 1000
export const TTL_SCREEN_CAGR_MS = 24 * 60 * 60 * 1000
export const REFRESH_LOCK_MS = 2 * 60 * 1000

export type HomeCacheRowInput = {
  company_raw_pack: CompanyRawPack | null
  company_raw_pack_fetched_at: string | null
  quote_row: Record<string, unknown> | null
  quote_fetched_at: string | null
  peer_medians: PeerMedians | null
  peer_medians_fetched_at: string | null
  forward_growth_charts: ForwardGrowthCharts | null
  forward_growth_fetched_at: string | null
  lock_until: string | null
  screen_scores_updated_at?: string | null
  forward_rev_cagr_3y?: number | null
}

export function msSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? Date.now() - t : Infinity
}

function packUsable(pack: CompanyRawPack | null | undefined): boolean {
  return !!pack?.incomeAnnual?.length
}

function analystsUsable(pack: CompanyRawPack | null | undefined): boolean {
  return (pack?.analystEstimates?.length ?? 0) > 0
}

export function isPackStale(row: HomeCacheRowInput, forceRefresh: boolean): boolean {
  if (forceRefresh) return true
  if (!packUsable(row.company_raw_pack)) return true
  if (!analystsUsable(row.company_raw_pack)) return true
  return msSince(row.company_raw_pack_fetched_at) > TTL_PACK_MS
}

export function isQuoteStale(row: HomeCacheRowInput, forceRefresh: boolean): boolean {
  if (forceRefresh) return true
  if (!row.quote_fetched_at) return true
  return msSince(row.quote_fetched_at) > TTL_QUOTE_MS
}

export function isPeersStale(
  row: HomeCacheRowInput,
  fetchPeers: boolean,
  forceRefresh: boolean,
): boolean {
  if (!fetchPeers) return false
  if (forceRefresh) return true
  if (!row.peer_medians || row.peer_medians.n === 0) return true
  if (msSince(row.peer_medians_fetched_at) > TTL_PEER_MS) return true
  if (
    row.company_raw_pack_fetched_at &&
    row.peer_medians_fetched_at &&
    new Date(row.peer_medians_fetched_at).getTime() < new Date(row.company_raw_pack_fetched_at).getTime()
  ) {
    return true
  }
  return false
}

export function isForwardGrowthStale(row: HomeCacheRowInput, forceRefresh: boolean): boolean {
  if (forceRefresh) return true
  const charts = row.forward_growth_charts ?? undefined
  if (!forwardGrowthChartsComplete(charts)) return true
  if (!forwardGrowthChartsUsable(charts)) return true
  return msSince(row.forward_growth_fetched_at) > TTL_FORWARD_MS
}

export function isScreenScoresStale(row: HomeCacheRowInput, forceRefresh: boolean): boolean {
  if (forceRefresh) return true
  if (row.forward_rev_cagr_3y == null || !Number.isFinite(row.forward_rev_cagr_3y)) return true
  return msSince(row.screen_scores_updated_at) > TTL_SCREEN_CAGR_MS
}

export function planHomeCacheRefresh(
  row: HomeCacheRowInput,
  opts: { fetchPeers: boolean; forceRefresh: boolean },
): { stale: HomeCacheSliceId[]; fresh: HomeCacheSliceId[] } {
  const checks: Array<[HomeCacheSliceId, boolean]> = [
    ['pack', isPackStale(row, opts.forceRefresh)],
    ['quote', isQuoteStale(row, opts.forceRefresh)],
    ['peers', isPeersStale(row, opts.fetchPeers, opts.forceRefresh)],
    ['forward_growth', isForwardGrowthStale(row, opts.forceRefresh)],
    ['screen_scores', isScreenScoresStale(row, opts.forceRefresh)],
  ]
  const stale: HomeCacheSliceId[] = []
  const fresh: HomeCacheSliceId[] = []
  for (const [id, isStale] of checks) {
    if (isStale) stale.push(id)
    else fresh.push(id)
  }
  return { stale, fresh }
}

export function refreshLockActive(lockUntil: string | null | undefined): boolean {
  if (!lockUntil) return false
  const t = new Date(lockUntil).getTime()
  return Number.isFinite(t) && t > Date.now()
}

export function buildHomeCacheAges(row: HomeCacheRowInput): Record<string, number | undefined> {
  return {
    pack: row.company_raw_pack_fetched_at ? msSince(row.company_raw_pack_fetched_at) : undefined,
    quote: row.quote_fetched_at ? msSince(row.quote_fetched_at) : undefined,
    peers: row.peer_medians_fetched_at ? msSince(row.peer_medians_fetched_at) : undefined,
    forward_growth: row.forward_growth_fetched_at ? msSince(row.forward_growth_fetched_at) : undefined,
  }
}
