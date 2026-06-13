import { parse } from 'yaml'
import rawConfig from '../../../config/fair_value.v1.yaml?raw'
import type { FairValueConfigRoot, FairValueProfileConfig, FairValueProfileId } from './types'

let cached: FairValueConfigRoot | null = null

export function loadFairValueConfig(): FairValueConfigRoot {
  if (!cached) {
    cached = parse(rawConfig) as FairValueConfigRoot
  }
  return cached
}

export function getProfileConfig(profileId: FairValueProfileId): FairValueProfileConfig {
  const cfg = loadFairValueConfig().profiles[profileId]
  if (!cfg) {
    throw new Error(`Missing fair value config for profile: ${profileId}`)
  }
  return cfg
}

export function methodWeightsFromConfig(
  profileId: FairValueProfileId,
  subProfileKey?: string,
): Partial<Record<string, number>> {
  const cfg = getProfileConfig(profileId)
  if (subProfileKey && cfg.sub_profiles?.[subProfileKey]) {
    return cfg.sub_profiles[subProfileKey]!
  }
  return cfg.methods ?? {}
}
