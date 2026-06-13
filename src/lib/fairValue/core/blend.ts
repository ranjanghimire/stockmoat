import type { FairValueMethodResult } from '../types'

export function blendMethodPrices(
  methods: FairValueMethodResult[],
  field: 'cfvPerShare' | 'ffv2PerShare',
): number | undefined {
  const valid = methods.filter((m) => m.status === 'ok' && m[field] !== undefined && Number.isFinite(m[field]!))
  if (valid.length === 0) return undefined
  const wSum = valid.reduce((s, m) => s + m.effectiveWeight, 0)
  if (wSum <= 0) return undefined
  return valid.reduce((s, m) => s + m[field]! * (m.effectiveWeight / wSum), 0)
}

export function applyEffectiveWeights(methods: FairValueMethodResult[]): FairValueMethodResult[] {
  const ok = methods.filter((m) => m.status === 'ok')
  const wSum = ok.reduce((s, m) => s + m.weight, 0)
  return methods.map((m) => ({
    ...m,
    effectiveWeight: m.status === 'ok' && wSum > 0 ? m.weight / wSum : 0,
  }))
}
