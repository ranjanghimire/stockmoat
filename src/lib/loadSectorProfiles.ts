import { parse } from 'yaml'
import rawConfig from '../../config/sector_profiles.v1.yaml?raw'
import type { ProfileMetricDef, SectorProfilesRoot } from '../types/sectorProfiles'

let cached: SectorProfilesRoot | null = null

export function loadSectorProfiles(): SectorProfilesRoot {
  if (!cached) {
    cached = parse(rawConfig) as SectorProfilesRoot
  }
  return cached
}

export function normalizeMetricWeights(metrics: ProfileMetricDef[]): ProfileMetricDef[] {
  const sum = metrics.reduce((a, m) => a + m.pillar_weight, 0)
  if (sum <= 0) return metrics
  const scale = 1 / sum
  return metrics.map((m) => ({ ...m, pillar_weight: m.pillar_weight * scale }))
}
