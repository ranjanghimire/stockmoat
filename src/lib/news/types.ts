export type NewsSourceType = 'fmp_news' | 'fmp_press' | 'sec_8k'

export type NewsCategory =
  | 'govt_policy'
  | 'megadeal'
  | 'capex'
  | 'm_and_a'
  | 'earnings_guide'
  | 'exec'
  | 'product'
  | 'other'

export interface NewsCandidate {
  fingerprint: string
  sourceType: NewsSourceType
  sourceUrl: string
  anchorSymbol: string
  laneIds: string[]
  publishedAt: Date
  headline: string
  excerpt: string
  secItems?: string[]
}

export interface GeminiNewsScore {
  publish: boolean
  impact_score: number
  category: NewsCategory
  lane_ids: string[]
  tickers: string[]
  headline_display: string
  why_material: string
}

export interface MaterialNewsInsert {
  published_at: string
  headline: string
  summary: string
  impact_score: number
  category: string
  lane_ids: string[]
  tickers: string[]
  source_type: NewsSourceType
  source_url: string
  anchor_symbol: string
  raw_excerpt: string | null
  sec_items: string[] | null
  gemini_model: string | null
}
