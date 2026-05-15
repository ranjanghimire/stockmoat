import type { NightlyDbContext } from './fetchNightlyDbContext'
import {
  moatCopyMissing,
  priorityTotal,
  type NightlySymbolSignals,
  scoreAgeDaysFromIso,
} from './nightlyPriority'

export interface BuildNightlyPlanOptions {
  budget: number
  /** screen_scores row older than this (days) counts as stale. */
  staleDays: number
  nowMs: number
  trendingRank: Map<string, number>
  /** Core screener slice in order (first = highest core priority). */
  coreOrdered: string[]
  db: NightlyDbContext
}

export interface NightlySymbolPlanResult {
  symbols: string[]
  debug: {
    trendingPicked: number
    editorialPicked: number
    stalePicked: number
    corePicked: number
    fillPicked: number
    trendingUniverse: number
    candidateCount: number
  }
}

function collectCandidateSymbols(
  trendingRank: Map<string, number>,
  coreOrdered: string[],
  db: NightlyDbContext,
): Set<string> {
  const s = new Set<string>()
  for (const k of trendingRank.keys()) s.add(k)
  for (const x of coreOrdered) s.add(x.trim().toUpperCase())
  for (const k of db.scoreUpdatedAt.keys()) s.add(k)
  for (const k of db.moatBodies.keys()) s.add(k)
  for (const k of db.homeCacheSymbols) s.add(k)
  return s
}

function buildSignals(
  symbol: string,
  opts: Pick<BuildNightlyPlanOptions, 'trendingRank' | 'coreOrdered' | 'db' | 'nowMs'>,
): NightlySymbolSignals {
  const { trendingRank, coreOrdered, db, nowMs } = opts
  const tr = trendingRank.get(symbol) ?? null
  const coreIdx = coreOrdered.findIndex((x) => x.trim().toUpperCase() === symbol)
  const corePosition = coreIdx >= 0 ? coreIdx + 1 : null
  const iso = db.scoreUpdatedAt.get(symbol)
  const age = scoreAgeDaysFromIso(iso, nowMs)
  const row = db.moatBodies.get(symbol)
  const missing = !row || moatCopyMissing(row.body, row.how)
  return {
    symbol,
    trendingRank: tr,
    corePosition,
    scoreAgeDays: age,
    moatMissing: missing,
  }
}

function isStale(symbol: string, db: NightlyDbContext, staleDays: number, nowMs: number): boolean {
  const iso = db.scoreUpdatedAt.get(symbol)
  if (!iso) return true
  const days = scoreAgeDaysFromIso(iso, nowMs)
  if (days === null) return true
  return days >= staleDays
}

/**
 * Tiered fill + remainder: trending → editorial (moat incomplete) → stale scores → core slice → global P fill.
 */
export function buildNightlySymbolPlan(opts: BuildNightlyPlanOptions): NightlySymbolPlanResult {
  const B = Math.max(1, Math.floor(opts.budget))
  const trendingQuota = Math.min(120, Math.floor(B * 0.25))
  const editorialQuota = Math.min(150, Math.floor(B * 0.2))
  const staleQuota = Math.min(400, Math.floor(B * 0.45))
  const coreQuota = Math.min(350, Math.floor(B * 0.35))

  const candidates = collectCandidateSymbols(opts.trendingRank, opts.coreOrdered, opts.db)
  const symList = [...candidates]

  const pScore = new Map<string, number>()
  for (const sym of symList) {
    const sig = buildSignals(sym, opts)
    pScore.set(sym, priorityTotal(sig))
  }

  const selected = new Set<string>()
  const order: string[] = []
  const debug = {
    trendingPicked: 0,
    editorialPicked: 0,
    stalePicked: 0,
    corePicked: 0,
    fillPicked: 0,
    trendingUniverse: opts.trendingRank.size,
    candidateCount: symList.length,
  }

  function pushFrom(list: string[], max: number, kind: keyof typeof debug): void {
    let n = 0
    for (const sym of list) {
      if (order.length >= B || n >= max) return
      if (selected.has(sym)) continue
      selected.add(sym)
      order.push(sym)
      n++
      debug[kind]++
    }
  }

  const trendingSorted = [...opts.trendingRank.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([sym]) => sym)
  pushFrom(trendingSorted, trendingQuota, 'trendingPicked')

  const editorialSorted = symList
    .filter((sym) => {
      const row = opts.db.moatBodies.get(sym)
      return !row || moatCopyMissing(row.body, row.how)
    })
    .sort((a, b) => (pScore.get(b)! - pScore.get(a)!) || a.localeCompare(b))
  pushFrom(editorialSorted, editorialQuota, 'editorialPicked')

  const staleSorted = symList
    .filter((sym) => isStale(sym, opts.db, opts.staleDays, opts.nowMs))
    .sort((a, b) => {
      const da = scoreAgeDaysFromIso(opts.db.scoreUpdatedAt.get(a), opts.nowMs) ?? 999
      const dbv = scoreAgeDaysFromIso(opts.db.scoreUpdatedAt.get(b), opts.nowMs) ?? 999
      return dbv - da || (pScore.get(b)! - pScore.get(a)!) || a.localeCompare(b)
    })
  pushFrom(staleSorted, staleQuota, 'stalePicked')

  const coreList = opts.coreOrdered.map((x) => x.trim().toUpperCase()).filter(Boolean)
  pushFrom(coreList, coreQuota, 'corePicked')

  const fillSorted = symList
    .filter((sym) => !selected.has(sym))
    .sort((a, b) => (pScore.get(b)! - pScore.get(a)!) || a.localeCompare(b))
  pushFrom(fillSorted, B - order.length, 'fillPicked')

  return { symbols: order, debug }
}
