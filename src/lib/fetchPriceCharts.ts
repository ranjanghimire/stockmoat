import { getFmpApiKey } from './fmp/http'
import { fetchFmpPriceCharts } from './fmp/fetchFmpPriceCharts'
import { fetchYahooPriceCharts } from './yahoo/fetchYahooPriceCharts'
import type { PriceChartsPayload } from './yahoo/weeklyChartTypes'

/**
 * Compact price charts: **FMP first** (dividend-adjusted daily EOD → ~2y weekly + ~6mo daily OHLC),
 * then **Yahoo** if FMP fails or no API key.
 */
export async function fetchPriceCharts(
  symbol: string,
  options?: { refresh?: boolean; signal?: AbortSignal },
): Promise<PriceChartsPayload> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) throw new Error('Missing symbol')

  const key = getFmpApiKey()
  const fmpFailures: string[] = []
  if (key) {
    try {
      return await fetchFmpPriceCharts(sym, key, { signal: options?.signal })
    } catch (e) {
      fmpFailures.push(e instanceof Error ? e.message : String(e))
    }
  }

  try {
    const yahoo = await fetchYahooPriceCharts(sym, options)
    return { ...yahoo, chartProvider: 'yahoo' }
  } catch (e) {
    const yahooErr = e instanceof Error ? e.message : String(e)
    const msg = fmpFailures.length
      ? `FMP could not load (${fmpFailures[0]}). Yahoo fallback failed (${yahooErr}).`
      : `Price charts: ${yahooErr}`
    const err = new Error(msg)
    if (e instanceof Error) err.cause = e
    throw err
  }
}
