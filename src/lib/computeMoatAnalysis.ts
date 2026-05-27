import type { MoatFundamentalsSnapshot } from './moatFundamentalsSnapshot'
import { loadSectorProfiles, normalizeMetricWeights } from './loadSectorProfiles'
import { metricLabel } from './metricLabels'
import { buildMetricInterpretation } from './metricInterpretation/buildInterpretation'
import type { MetricInterpretation } from './metricInterpretation/types'
import type { MetricEval } from './mockMetricDriver'
import type { ProfileMetricDef } from '../types/sectorProfiles'
import type { CompanyFacts } from './fmp/buildCompanyFacts'
import type { PeerMedians } from './fmp/peerMedians'

export interface MetricRow extends ProfileMetricDef {
  label: string
  subscore: number
  gatePass: boolean
  displayValue: string
  peerNote?: string
  gateCredit?: number
  breakdown?: string[]
  /** User-facing verdict, meter, and plain-English headline. */
  interpretation?: MetricInterpretation
  /** Points toward the 0–1 weighted sum (weight × subscore or gate credit). */
  weightedContribution: number
}

export interface PillarRollup {
  pillar: string
  weight: number
  contribution: number
  /** Same 1–10 scale as headline score, using only this pillar’s lines (avg outcome vs pillar weight). */
  pillarScore: number
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
  dataSource: 'fmp' | 'demo' | 'yahoo_dev'
  /** TTM / BS figures for UI (cash-truth drill-down, etc.). */
  fundamentals?: MoatFundamentalsSnapshot
  /**
   * Last quote snapshot for UI only (not scoring). `fetchedAt` is when we persisted it in this session;
   * treat as stale per `DELAYED_PRICE_SNAPSHOT_TTL_MS` when reading cache.
   */
  delayedPrice?: { value: number; currency: string; fetchedAt: number }
}

export function computeMoatAnalysis(
  ticker: string,
  displayName: string,
  profileId: string,
  metricsInput: ProfileMetricDef[],
  itVariant: string | undefined,
  evaluateMetric: (m: ProfileMetricDef) => MetricEval,
  meta?: {
    sector?: string
    industry?: string
    dataSource?: 'fmp' | 'demo' | 'yahoo_dev'
    fundamentals?: MoatFundamentalsSnapshot
    facts?: CompanyFacts
    peers?: PeerMedians | null
  },
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

    const weightedContribution =
      m.mode === 'gate' ? m.pillar_weight * (ev.gatePass ? (ev.gateCredit ?? 1) : 0) : m.pillar_weight * ev.subscore

    const interpretation = buildMetricInterpretation(m.id, ev, m, {
      sector: meta?.sector,
      facts: meta?.facts,
      peers: meta?.peers ?? null,
    })

    rows.push({
      ...m,
      label,
      subscore: ev.subscore,
      gatePass: ev.gatePass,
      displayValue: ev.displayValue,
      peerNote: ev.peerNote,
      gateCredit: ev.gateCredit,
      breakdown: ev.breakdown,
      interpretation,
      weightedContribution,
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

  const pillars: PillarRollup[] = [...pillarMap.entries()].map(([pillar, v]) => {
    const strength = v.weight > 0 ? Math.min(1, Math.max(0, v.contribution / v.weight)) : 0
    const pillarScore = Math.round((1 + 9 * strength) * 10) / 10
    return { pillar, weight: v.weight, contribution: v.contribution, pillarScore }
  })

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
    fundamentals: meta?.fundamentals,
  }
}
