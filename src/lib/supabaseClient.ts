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
  forward_rev_cagr_3y: number | null
  forward_growth_score: number | null
  updated_at: string
}

/** Row from `screen_screener_list` view (scores + next earnings). */
export interface ScreenScreenerRow extends ScreenScoreRow {
  next_earnings_date: string | null
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
export type MaterialNewsSourceType = 'fmp_news' | 'fmp_press' | 'sec_8k'

/** Row from `material_news` (anchor-driven material events digest). */
export interface MaterialNewsRow {
  id: string
  published_at: string
  headline: string
  summary: string
  impact_score: number
  category: string
  lane_ids: string[]
  tickers: string[]
  source_type: MaterialNewsSourceType
  source_url: string
  anchor_symbol: string
}

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
