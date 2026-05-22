export interface NewsPublishConfig {
  impact_threshold: number
  global_max_per_24h: number
  per_lane_max_per_24h: number
}

export interface NewsAnchorLane {
  label: string
  profile_ids: string[]
  tickers: string[]
}

export interface NewsAnchorsRoot {
  schema: string
  publish: NewsPublishConfig
  lanes: Record<string, NewsAnchorLane>
}
