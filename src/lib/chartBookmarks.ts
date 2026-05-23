export type ChartTimeframe = 'weekly' | 'daily'

export type ChartBookmarkEntry = {
  symbol: string
  timeframe: ChartTimeframe
  bookmarkedAt: number
}

export const CHART_BOOKMARKS_STORAGE_KEY = 'stockmoat-chart-bookmarks-v1'

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

function bookmarkKey(symbol: string, timeframe: ChartTimeframe): string {
  return `${normalizeSymbol(symbol)}|${timeframe}`
}

export function readChartBookmarks(): ChartBookmarkEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CHART_BOOKMARKS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ChartBookmarkEntry[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const symbol = typeof o.symbol === 'string' ? normalizeSymbol(o.symbol) : ''
      const timeframe = o.timeframe === 'weekly' || o.timeframe === 'daily' ? o.timeframe : null
      const bookmarkedAt = typeof o.bookmarkedAt === 'number' && Number.isFinite(o.bookmarkedAt) ? o.bookmarkedAt : 0
      if (!symbol || !timeframe) continue
      out.push({ symbol, timeframe, bookmarkedAt })
    }
    return out
  } catch {
    return []
  }
}

export function writeChartBookmarks(entries: ChartBookmarkEntry[]): void {
  if (typeof window === 'undefined') return
  const deduped = new Map<string, ChartBookmarkEntry>()
  for (const entry of entries) {
    const symbol = normalizeSymbol(entry.symbol)
    if (!symbol) continue
    const key = bookmarkKey(symbol, entry.timeframe)
    const existing = deduped.get(key)
    if (!existing || entry.bookmarkedAt >= existing.bookmarkedAt) {
      deduped.set(key, { symbol, timeframe: entry.timeframe, bookmarkedAt: entry.bookmarkedAt })
    }
  }
  const sorted = [...deduped.values()].sort((a, b) => b.bookmarkedAt - a.bookmarkedAt)
  window.localStorage.setItem(CHART_BOOKMARKS_STORAGE_KEY, JSON.stringify(sorted))
}

export function isChartBookmarked(
  entries: ChartBookmarkEntry[],
  symbol: string,
  timeframe: ChartTimeframe,
): boolean {
  const sym = normalizeSymbol(symbol)
  return entries.some((e) => e.symbol === sym && e.timeframe === timeframe)
}

export function toggleChartBookmark(
  entries: ChartBookmarkEntry[],
  symbol: string,
  timeframe: ChartTimeframe,
): ChartBookmarkEntry[] {
  const sym = normalizeSymbol(symbol)
  const key = bookmarkKey(sym, timeframe)
  const exists = entries.some((e) => bookmarkKey(e.symbol, e.timeframe) === key)
  if (exists) {
    return entries.filter((e) => bookmarkKey(e.symbol, e.timeframe) !== key)
  }
  return [{ symbol: sym, timeframe, bookmarkedAt: Date.now() }, ...entries]
}

/** Unique symbols in bookmark order (most recently bookmarked symbol first). */
export function bookmarkedSymbolsGrouped(entries: ChartBookmarkEntry[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const sorted = [...entries].sort((a, b) => b.bookmarkedAt - a.bookmarkedAt)
  for (const e of sorted) {
    if (seen.has(e.symbol)) continue
    seen.add(e.symbol)
    ordered.push(e.symbol)
  }
  return ordered
}

export function bookmarkedTimeframesForSymbol(
  entries: ChartBookmarkEntry[],
  symbol: string,
): ChartTimeframe[] {
  const sym = normalizeSymbol(symbol)
  const set = new Set<ChartTimeframe>()
  for (const e of entries) {
    if (e.symbol === sym) set.add(e.timeframe)
  }
  const order: ChartTimeframe[] = ['weekly', 'daily']
  return order.filter((t) => set.has(t))
}
