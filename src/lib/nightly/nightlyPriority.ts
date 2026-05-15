/** Priority score inputs for one symbol (higher = process sooner). */
export interface NightlySymbolSignals {
  symbol: string
  trendingRank: number | null
  corePosition: number | null
  scoreAgeDays: number | null
  moatMissing: boolean
}

export function moatCopyMissing(body: string | null | undefined, how: string | null | undefined): boolean {
  const b = typeof body === 'string' ? body.trim() : ''
  const h = typeof how === 'string' ? how.trim() : ''
  return b.length === 0 || h.length === 0
}

/** Trending component P_trend (0 … ~640). */
export function priorityTrending(trendingRank: number | null): number {
  if (trendingRank === null || trendingRank < 1) return 0
  const base = 600 - 6 * (trendingRank - 1)
  const topBoost = trendingRank <= 20 ? 40 : 0
  return Math.max(0, base + topBoost)
}

/** Staleness from screen_scores age (0 … 300). No score row → treat as max staleness. */
export function priorityStale(scoreAgeDays: number | null): number {
  const days = scoreAgeDays === null ? 90 : Math.min(Math.max(0, scoreAgeDays), 90)
  return 300 * Math.pow(days / 90, 1.2)
}

/** Core rotation slice position (0 … 80). */
export function priorityCore(corePosition: number | null): number {
  if (corePosition === null || corePosition < 1) return 0
  return Math.max(0, 80 - (corePosition - 1))
}

/** Editorial backfill bump when moat / revenue copy incomplete. */
export function priorityEditorial(moatMissing: boolean): number {
  return moatMissing ? 120 : 0
}

export function priorityTotal(s: NightlySymbolSignals): number {
  return (
    priorityTrending(s.trendingRank) +
    priorityStale(s.scoreAgeDays) +
    priorityCore(s.corePosition) +
    priorityEditorial(s.moatMissing)
  )
}

export function scoreAgeDaysFromIso(updatedAtIso: string | null | undefined, nowMs: number): number | null {
  if (!updatedAtIso) return null
  const t = Date.parse(updatedAtIso)
  if (!Number.isFinite(t)) return null
  return (nowMs - t) / 86_400_000
}
