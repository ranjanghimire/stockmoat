import { loadFairValueConfig } from '../loadFairValueConfig'
import type { FairValueProfileId } from '../types'
import { clamp } from './fairMultiple'

export function computeMoatQuality(
  moatScore: number,
  safetyGateFailed: boolean,
): { q: number; notes: string[] } {
  const cfg = loadFairValueConfig().defaults.quality
  let q = 1 + cfg.moat_alpha * ((moatScore - cfg.moat_center) / 4.5)
  q = clamp(q, cfg.moat_min, cfg.moat_max)
  const notes: string[] = [`Moat score ${moatScore.toFixed(1)} → Q_moat ${q.toFixed(3)}`]
  if (safetyGateFailed) {
    q = Math.min(q, 1.0)
    notes.push('Safety gate failed — Q_moat capped at 1.0')
  }
  return { q, notes }
}

export function clampProfileQ(q: number, profileId: FairValueProfileId): number {
  const profile = loadFairValueConfig().profiles[profileId]
  if (!profile) return clamp(q, 0.75, 1.3)
  return clamp(q, profile.q_min, profile.q_max)
}
