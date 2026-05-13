export type OhlcvBar = { t: number; o: number; h: number; l: number; c: number }

export type PriceChartsPayload = {
  symbol: string
  currency: string
  /** ~2y weekly candles (ISO week, last session in week). */
  weekly: OhlcvBar[]
  /** ~6mo daily candles. */
  daily: OhlcvBar[]
  /** `fmp`: dividend-adjusted daily EOD. `yahoo`: native chart intervals. */
  chartProvider?: 'fmp' | 'yahoo'
}
