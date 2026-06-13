import { loadFairValueConfig } from '../loadFairValueConfig'
import type { FairValueBand } from '../types'
import { clamp } from './fairMultiple'

export function computeBands(
  base: number,
  opts: { thinPeers?: boolean; isYield?: boolean },
): FairValueBand {
  const cfg = loadFairValueConfig().defaults.bands
  let swing = opts.isYield ? cfg.yield_swing : cfg.multiple_swing
  if (opts.thinPeers) swing += cfg.thin_peers_extra
  const low = base * (1 - swing)
  const high = base * (1 + swing)
  return { low: clamp(low, 0, Infinity), base, high: clamp(high, 0, Infinity) }
}

export function computeConfidence(
  methodCount: number,
  peerN: number,
  hasFfv2: boolean,
): 'high' | 'medium' | 'low' {
  if (methodCount >= 3 && peerN >= 8 && hasFfv2) return 'high'
  if (methodCount >= 2 && peerN >= 5) return 'medium'
  return 'low'
}

export function upsidePct(fair: number, price: number | undefined): number | undefined {
  if (price === undefined || !Number.isFinite(price) || price <= 0) return undefined
  return (fair - price) / price
}

export function cagrToTarget(target: number, price: number, years: number): number | undefined {
  if (price <= 0 || target <= 0 || years <= 0) return undefined
  return Math.pow(target / price, 1 / years) - 1
}
