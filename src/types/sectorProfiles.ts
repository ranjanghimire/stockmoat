export type MetricMode = 'gate' | 'score' | 'hybrid'

export interface ProfileMetricDef {
  id: string
  pillar: string
  pillar_weight: number
  mode: MetricMode
  peer_relative?: boolean
}

export interface ProfileVariantBlock {
  metrics: ProfileMetricDef[]
  ignored_metrics?: string[]
  fallbacks?: Record<string, string>
}

export interface ProfileDef {
  description?: string
  gics_mapping_hints?: Record<string, unknown>
  metrics?: ProfileMetricDef[]
  variants?: Record<string, ProfileVariantBlock>
  variant_selection?: Record<string, { match_sub_industries_contains: string[] }>
  ignored_metrics?: string[]
  missing_metric_redistribution?: Record<string, string>
}

export interface SectorProfilesRoot {
  schema: string
  peer_rules: Record<string, unknown>
  score_caps: { any_gate_fail: number; critical_gate_fail: number }
  profiles: Record<string, ProfileDef>
  implementation_notes?: Record<string, string>
}

export type ItVariant = 'software_saas' | 'semis_hardware'
