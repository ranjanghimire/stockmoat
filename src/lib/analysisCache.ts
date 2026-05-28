import type { MoatAnalysis } from './computeMoatAnalysis'
import { shouldFetchFmpPeerMedians } from './dataSource'

export const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000
export const ANALYSIS_CACHE_MAX_ENTRIES = 32

export type AnalysisCacheEntry = { savedAt: number; analysis: MoatAnalysis }

/** Stable key for cached `MoatAnalysis` (same inputs → same score table). */
export function analysisCacheKey(
  sym: string,
  useYahoo: boolean,
  profileMode: 'auto' | 'manual',
  manualProfile: string,
): string {
  const profilePart = profileMode === 'manual' ? manualProfile : 'auto'
  const peersOn = !useYahoo && shouldFetchFmpPeerMedians() ? '1' : '0'
  /** Bump when fundamentals payload shape changes (invalidates stale in-memory cache). */
  const fundamentalsSchema = 'fg8'
  return `${sym}|${useYahoo ? 'Y' : 'F'}|${profileMode}|${profilePart}|p${peersOn}|${fundamentalsSchema}`
}

export function readAnalysisCache(
  map: Map<string, AnalysisCacheEntry>,
  key: string,
  now: number,
  ttlMs: number,
): MoatAnalysis | null {
  const e = map.get(key)
  if (!e) return null
  if (now - e.savedAt > ttlMs) {
    map.delete(key)
    return null
  }
  map.delete(key)
  map.set(key, e)
  return e.analysis
}

export function writeAnalysisCache(
  map: Map<string, AnalysisCacheEntry>,
  key: string,
  entry: AnalysisCacheEntry,
  maxEntries: number,
): void {
  if (map.size >= maxEntries && !map.has(key)) {
    let oldestKey: string | undefined
    let oldestAt = Infinity
    for (const [k, v] of map) {
      if (v.savedAt < oldestAt) {
        oldestAt = v.savedAt
        oldestKey = k
      }
    }
    if (oldestKey) map.delete(oldestKey)
  }
  map.set(key, entry)
}
