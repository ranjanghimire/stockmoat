import { applyEffectiveWeights, blendMethodPrices } from './core/blend'
import {
  cagrToTarget,
  computeBands,
  computeConfidence,
  upsidePct,
} from './core/bands'
import { createInitialContext } from './buildContext'
import { getFairValueAdapter } from './adapters'
import { runMethod } from './methods'
import { cyclicalWarning } from './profiles/createEvCyclicalAdapter'
import { cyclicalWarning as semisCyclicalWarning } from './profiles/semisHardwareAdapter'
import type {
  FairValueInput,
  FairValueMethodId,
  FairValueResult,
  FairValueSnapshot,
} from './types'

export function computeFairValue(input: FairValueInput): FairValueResult | null {
  const adapter = getFairValueAdapter(input.profileId)
  const initial = createInitialContext(input, input.forwardEstimates)
  if (!initial) return null

  const subProfileId = adapter.classifySubProfile(initial)
  if (subProfileId === 'insufficient') return null

  initial.subProfileId = subProfileId
  initial.operating = adapter.normalizeOperatingMetrics(initial)

  const { q, notes } = adapter.computeQualityMultiplier(initial)
  initial.qualityMultiplier = q
  initial.qualityNotes = notes

  const weights = adapter.methodWeights(subProfileId)
  const active = adapter.activeMethods(subProfileId)
  const warnings = [...initial.warnings]
  const cyclicalMsg = cyclicalWarning(subProfileId) ?? semisCyclicalWarning(subProfileId)
  if (cyclicalMsg) warnings.push(cyclicalMsg)

  const peerN = input.peers?.n ?? 0
  if (peerN < 3) warnings.push('Thin peer set — sector anchors used heavily.')

  const methods = active.map((methodId) => {
    const w = weights[methodId] ?? 0
    if (w <= 0) {
      return runMethod(methodId, initial, 0)
    }
    return runMethod(methodId, initial, w)
  })

  const withWeights = applyEffectiveWeights(methods)
  const cfvBase = blendMethodPrices(withWeights, 'cfvPerShare')
  if (cfvBase === undefined || !Number.isFinite(cfvBase)) return null

  const ffv2Base = blendMethodPrices(withWeights, 'ffv2PerShare')
  const thinPeers = peerN < 3

  const cfv = computeBands(cfvBase, { thinPeers })
  const ffv2 =
    ffv2Base !== undefined && Number.isFinite(ffv2Base)
      ? computeBands(ffv2Base, { thinPeers })
      : undefined

  const marketPrice = input.facts.price
  const okMethodCount = withWeights.filter((m) => m.status === 'ok').length

  return {
    symbol: input.symbol.toUpperCase(),
    profileId: input.profileId,
    subProfileId,
    asOf: new Date().toISOString().slice(0, 10),
    marketPrice,
    cfv,
    ffv2,
    upsideToCfvPct: upsidePct(cfv.base, marketPrice),
    upsideToFfv2Pct: ffv2 ? upsidePct(ffv2.base, marketPrice) : undefined,
    cagrToFfv2:
      ffv2 && marketPrice !== undefined ? cagrToTarget(ffv2.base, marketPrice, 2) : undefined,
    qualityMultiplier: q,
    methods: withWeights,
    confidence: computeConfidence(okMethodCount, peerN, ffv2 !== undefined),
    warnings,
  }
}

export function toFairValueSnapshot(result: FairValueResult): FairValueSnapshot {
  return {
    cfv: result.cfv,
    ffv2: result.ffv2,
    marketPrice: result.marketPrice,
    upsideToCfvPct: result.upsideToCfvPct,
    upsideToFfv2Pct: result.upsideToFfv2Pct,
    cagrToFfv2: result.cagrToFfv2,
    profileId: result.profileId,
    subProfileId: result.subProfileId,
    qualityMultiplier: result.qualityMultiplier,
    confidence: result.confidence,
    methods: result.methods,
    warnings: result.warnings,
    asOf: result.asOf,
  }
}

export type { FairValueInput, FairValueResult, FairValueMethodId }
