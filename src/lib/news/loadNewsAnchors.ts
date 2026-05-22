import { parse } from 'yaml'
import rawConfig from '../../../config/news_anchors.v1.yaml?raw'
import type { NewsAnchorsRoot } from '../../types/newsAnchors'

let cached: NewsAnchorsRoot | null = null

export function loadNewsAnchors(): NewsAnchorsRoot {
  if (!cached) cached = parse(rawConfig) as NewsAnchorsRoot
  return cached
}

/** Unique symbols across all lanes (uppercase). */
export function allAnchorSymbols(root = loadNewsAnchors()): string[] {
  const set = new Set<string>()
  for (const lane of Object.values(root.lanes)) {
    for (const t of lane.tickers) {
      const s = t.trim().toUpperCase()
      if (s) set.add(s)
    }
  }
  return [...set].sort()
}

/** lane id → tickers for that lane. */
export function lanesBySymbol(root = loadNewsAnchors()): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const [laneId, lane] of Object.entries(root.lanes)) {
    for (const t of lane.tickers) {
      const sym = t.trim().toUpperCase()
      if (!sym) continue
      const prev = m.get(sym) ?? []
      if (!prev.includes(laneId)) prev.push(laneId)
      m.set(sym, prev)
    }
  }
  return m
}
