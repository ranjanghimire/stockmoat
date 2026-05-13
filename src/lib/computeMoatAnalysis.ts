import { loadSectorProfiles, normalizeMetricWeights } from './loadSectorProfiles'
import { metricLabel } from './metricLabels'
import type { MetricEval } from './mockMetricDriver'
import type { ProfileMetricDef } from '../types/sectorProfiles'

export interface MetricRow extends ProfileMetricDef {
  label: string
  subscore: number
  gatePass: boolean
  displayValue: string
  peerNote?: string
  gateCredit?: number
}

export interface PillarRollup {
  pillar: string
  weight: number
  contribution: number
}

export interface MoatAnalysis {
  ticker: string
  displayName: string
  profileId: string
  itVariant?: string
  score: number
  rawWeighted: number
  anyGateFail: boolean
  scoreCap: number
  metrics: MetricRow[]
  pillars: PillarRollup[]
  sector?: string
  industry?: string
  dataSource: 'fmp' | 'demo'
}

export function computeMoatAnalysis(
  ticker: string,
  displayName: string,
  profileId: string,
  metricsInput: ProfileMetricDef[],
  itVariant: string | undefined,
  evaluateMetric: (m: ProfileMetricDef) => MetricEval,
  meta?: { sector?: string; industry?: string; dataSource?: 'fmp' | 'demo' },
): MoatAnalysis {
  const root = loadSectorProfiles()
  const metrics = normalizeMetricWeights(metricsInput)
  const cap = root.score_caps?.any_gate_fail ?? 6

  const rows: MetricRow[] = []
  let rawWeighted = 0
  let anyGateFail = false

  for (const m of metrics) {
    const ev = evaluateMetric(m)
    const label = metricLabel(m.id)

    if (m.mode === 'gate') {
      if (!ev.gatePass) anyGateFail = true
      const credit = ev.gatePass ? (ev.gateCredit ?? 1) : 0
      rawWeighted += m.pillar_weight * credit
    } else {
      rawWeighted += m.pillar_weight * ev.subscore
    }

    rows.push({
      ...m,
      label,
      subscore: ev.subscore,
      gatePass: ev.gatePass,
      displayValue: ev.displayValue,
      peerNote: ev.peerNote,
      gateCredit: ev.gateCredit,
    })
  }

  let score = 1 + 9 * Math.min(1, Math.max(0, rawWeighted))
  if (anyGateFail) score = Math.min(score, cap)
  score = Math.round(score * 10) / 10

  const pillarMap = new Map<string, { weight: number; contribution: number }>()
  for (const m of rows) {
    const contrib =
      m.mode === 'gate'
        ? m.pillar_weight * (m.gatePass ? (m.gateCredit ?? 1) : 0)
        : m.pillar_weight * m.subscore
    const cur = pillarMap.get(m.pillar) ?? { weight: 0, contribution: 0 }
    cur.weight += m.pillar_weight
    cur.contribution += contrib
    pillarMap.set(m.pillar, cur)
  }

  const pillars: PillarRollup[] = [...pillarMap.entries()].map(([pillar, v]) => ({
    pillar,
    weight: v.weight,
    contribution: v.contribution,
  }))

  return {
    ticker,
    displayName,
    profileId,
    itVariant,
    score,
    rawWeighted,
    anyGateFail,
    scoreCap: cap,
    metrics: rows,
    pillars,
    sector: meta?.sector,
    industry: meta?.industry,
    dataSource: meta?.dataSource ?? 'demo',
  }
}
