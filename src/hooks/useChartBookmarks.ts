import { useCallback, useEffect, useState } from 'react'
import {
  CHART_BOOKMARKS_STORAGE_KEY,
  bookmarkedSymbolsGrouped,
  bookmarkedTimeframesForSymbol,
  isChartBookmarked,
  readChartBookmarks,
  toggleChartBookmark,
  writeChartBookmarks,
  type ChartBookmarkEntry,
  type ChartTimeframe,
} from '../lib/chartBookmarks'

export function useChartBookmarks() {
  const [entries, setEntries] = useState<ChartBookmarkEntry[]>(() => readChartBookmarks())

  useEffect(() => {
    const sync = () => setEntries(readChartBookmarks())
    const onStorage = (event: StorageEvent) => {
      if (event.key === CHART_BOOKMARKS_STORAGE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((symbol: string, timeframe: ChartTimeframe) => {
    setEntries((prev) => {
      const next = toggleChartBookmark(prev, symbol, timeframe)
      writeChartBookmarks(next)
      return next
    })
  }, [])

  const isBookmarked = useCallback(
    (symbol: string, timeframe: ChartTimeframe) => isChartBookmarked(entries, symbol, timeframe),
    [entries],
  )

  const symbolsGrouped = bookmarkedSymbolsGrouped(entries)

  const timeframesFor = useCallback(
    (symbol: string) => bookmarkedTimeframesForSymbol(entries, symbol),
    [entries],
  )

  return {
    entries,
    toggle,
    isBookmarked,
    symbolsGrouped,
    timeframesFor,
    count: entries.length,
  }
}
