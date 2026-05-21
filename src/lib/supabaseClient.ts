import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MoatContentSource } from './moatContentSource'
import type { PriceChartsPayload } from './yahoo/weeklyChartTypes'

export interface ScreenScoreRow {
  symbol: string
  display_name: string
  score: number
  profile_id: string
  sector: string | null
  industry: string | null
  any_gate_fail: boolean
  score_cap: number | null
  raw_weighted: number | null
  updated_at: string
}

/** Row from `screen_charts` (nightly FMP payload for Screener). */
export interface ScreenChartRow {
  symbol: string
  payload: PriceChartsPayload | null
  fetch_error: string | null
  updated_at: string
}

/** Row from `ticker_next_earnings` (nightly FMP next earnings for Home). */
export interface TickerNextEarningsRow {
  symbol: string
  next_earnings_date: string | null
  fetch_error: string | null
  updated_at: string
}

/** Row from `company_moat_summaries` (moat + revenue narrative on Home MOAT ANALYSIS). */
export interface CompanyMoatSummaryRow {
  symbol: string
  body: string
  how_they_make_money_body?: string | null
  recent_deals_body?: string | null
  /** `curated` = human; `auto_generated` = model/nightly job — query for review with `= 'auto_generated'`. */
  content_source: MoatContentSource
  updated_at: string
}

let client: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) return null
  client = createClient(url, anon)
  return client
}
