import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'

export function isPriceChartsPayload(v: unknown): v is PriceChartsPayload {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.symbol === 'string' && Array.isArray(o.weekly) && Array.isArray(o.daily)
}

export type ChartEmbed = {
  payload: unknown
  fetch_error: string | null
  updated_at?: string
}

export type ScoreWithChartRow = {
  symbol: string
  display_name?: string | null
  screen_charts: ChartEmbed | ChartEmbed[] | null
}

export function pickEmbeddedChart(row: ScoreWithChartRow): ChartEmbed | null {
  const c = row.screen_charts
  if (!c) return null
  if (Array.isArray(c)) return c[0] ?? null
  return c
}

export function parseChartPanel(row: ScoreWithChartRow): {
  symbol: string
  displayName: string | null
  data: PriceChartsPayload | null
  err: string | null
} {
  const sym = row.symbol
  const displayName = typeof row.display_name === 'string' ? row.display_name : null
  const embed = pickEmbeddedChart(row)
  if (!embed) {
    return { symbol: sym, displayName, data: null, err: 'Missing chart row.' }
  }
  if (embed.fetch_error) {
    return { symbol: sym, displayName, data: null, err: embed.fetch_error }
  }
  if (!embed.payload || !isPriceChartsPayload(embed.payload)) {
    return { symbol: sym, displayName, data: null, err: 'Invalid or empty chart payload.' }
  }
  return { symbol: sym, displayName, data: embed.payload, err: null }
}
