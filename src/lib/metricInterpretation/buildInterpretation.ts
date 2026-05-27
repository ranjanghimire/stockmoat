import type { CompanyFacts } from '../fmp/buildCompanyFacts'
import type { PeerMedians } from '../fmp/peerMedians'
import type { MetricEval } from '../mockMetricDriver'
import type { MetricEvalHints } from './types'
import type { ProfileMetricDef } from '../../types/sectorProfiles'
import { formatMetricValue, formatPeerRatio, fmtNum } from './formatters'
import { metricUiSpec, peBandForSector, type PeSectorBand } from './registry'
import type {
  MetricInterpretation,
  MetricMeterKind,
  MetricSparkline,
  MetricVerdict,
  ValuationSummary,
  ValuationSummaryLine,
} from './types'
import { VALUATION_ROW_SPECS } from './registry'

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

export function subscoreToVerdict(sub: number, gatePass?: boolean, mode?: string): MetricVerdict {
  if (mode === 'gate' || mode === 'hybrid') {
    if (gatePass === false) return 'fail'
    if (gatePass === true) return sub >= 0.7 ? 'pass' : 'fair'
  }
  if (!Number.isFinite(sub)) return 'unavailable'
  if (sub >= 0.85) return 'strong'
  if (sub >= 0.7) return 'good'
  if (sub >= 0.55) return 'fair'
  if (sub >= 0.4) return 'weak'
  return 'poor'
}

export function verdictLabel(v: MetricVerdict): string {
  switch (v) {
    case 'strong':
      return 'Strong'
    case 'good':
      return 'Good'
    case 'fair':
      return 'Mixed'
    case 'weak':
      return 'Weak'
    case 'poor':
      return 'Poor'
    case 'pass':
      return 'Pass'
    case 'fail':
      return 'Does not pass'
    case 'unavailable':
      return 'Unavailable'
    default:
      return '—'
  }
}

function peerMeterPosition(subject: number, peer: number, lowerBetter: boolean): number {
  if (!Number.isFinite(subject) || !Number.isFinite(peer) || peer <= 0) return 0.5
  const rel = subject / peer
  if (lowerBetter) {
    if (rel <= 0.75) return 0.92
    if (rel <= 0.9) return 0.78
    if (rel <= 1.0) return 0.62
    if (rel <= 1.15) return 0.42
    if (rel <= 1.5) return 0.22
    return 0.08
  }
  if (rel >= 1.25) return 0.92
  if (rel >= 1.1) return 0.78
  if (rel >= 1.0) return 0.62
  if (rel >= 0.85) return 0.42
  if (rel >= 0.65) return 0.22
  return 0.08
}

function absoluteBandPosition(value: number, min: number, max: number, invert: boolean): number {
  const t = clamp01((value - min) / Math.max(max - min, 1e-9))
  return invert ? 1 - t : t
}

function headlineForPeer(
  label: string,
  subject: number | undefined,
  peer: number | undefined,
  lowerBetter: boolean,
  unit: import('./types').MetricValueUnit,
  verdict: MetricVerdict,
): string {
  const subjFmt = formatMetricValue(subject, unit)
  const peerFmt = formatMetricValue(peer, unit)
  if (subject === undefined || peer === undefined) {
    return `${label} reading is ${subjFmt}; peer comparison was not available for this line.`
  }
  const rel = formatPeerRatio(subject, peer, unit)
  const tone =
    verdict === 'strong' || verdict === 'good'
      ? lowerBetter
        ? 'more attractive than typical peers on this measure'
        : 'stronger than typical peers on this measure'
      : verdict === 'weak' || verdict === 'poor'
        ? lowerBetter
          ? 'more expensive than typical peers on this measure'
          : 'weaker than typical peers on this measure'
        : 'roughly in line with peers on this measure'
  return `Your ${label} is ${subjFmt} vs peer median ${peerFmt}${rel ? ` (${rel})` : ''} — ${tone}.`
}

function pegHeadline(peg: number, verdict: MetricVerdict): string {
  const v = verdictLabel(verdict)
  if (peg < 0.5) return `PEG ${fmtNum(peg, 2)} is very low — ${v.toLowerCase()} on our scale (often implies high growth vs price).`
  if (peg <= 1.2) return `PEG ${fmtNum(peg, 2)} is in a commonly “fair” zone — ${v.toLowerCase()} for this check.`
  if (peg <= 2) return `PEG ${fmtNum(peg, 2)} is elevated — ${v.toLowerCase()}; you pay more per unit of expected growth.`
  return `PEG ${fmtNum(peg, 2)} is high — ${v.toLowerCase()} on this rubric.`
}

function peHeadline(pe: number, band: PeSectorBand, label: string): string {
  if (pe <= band.cheap) return `${label} ${fmtNum(pe, 1)}× is below typical “cheap” range for this sector (${band.cheap}×–${band.fairLow}×).`
  if (pe <= band.fairHigh) return `${label} ${fmtNum(pe, 1)}× sits in a typical sector band (${band.fairLow}×–${band.fairHigh}×).`
  if (pe <= band.expensive) return `${label} ${fmtNum(pe, 1)}× is above typical sector levels — toward expensive territory.`
  return `${label} ${fmtNum(pe, 1)}× is well above common sector ranges — priced for strong expectations.`
}

function peMeterFromBand(pe: number, band: PeSectorBand): number {
  if (pe <= band.cheap) return 0.88
  if (pe <= band.fairLow) return 0.72
  if (pe <= band.fairHigh) return 0.55
  if (pe <= band.expensive) return 0.32
  return 0.12
}

function grossMarginVolFromFacts(facts: CompanyFacts): number | undefined {
  const g = facts.annualGrossMargin.slice(0, 3).filter((x) => Number.isFinite(x))
  if (g.length < 2) return undefined
  const mean = g.reduce((a, b) => a + b, 0) / g.length
  const varr = g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length
  return Math.sqrt(varr) * 100
}

function grossMarginSparkline(facts: CompanyFacts): MetricSparkline | undefined {
  const g = facts.annualGrossMargin.slice(0, 4).filter((x) => Number.isFinite(x))
  if (g.length < 2) return undefined
  const chronological = [...g].reverse()
  return {
    values: chronological.map((x) => x * 100),
    caption: 'Annual gross margin % (oldest → newest)',
  }
}

function revenueSparkline(facts: CompanyFacts): MetricSparkline | undefined {
  const rev = facts.annualRevenue.slice(0, 4).filter((x) => Number.isFinite(x) && x > 0)
  if (rev.length < 2) return undefined
  const chronological = [...rev].reverse()
  return {
    values: chronological,
    caption: 'Annual revenue (oldest → newest)',
  }
}

function gateHeadline(metricId: string, gatePass: boolean, displayValue: string): string {
  if (gatePass) return `This check passed: ${displayValue}`
  if (metricId.includes('debt') || metricId.includes('interest')) return `This safety check did not clear: ${displayValue}`
  return `This requirement was not met: ${displayValue}`
}

export function buildMetricInterpretation(
  metricId: string,
  ev: MetricEval,
  def: Pick<ProfileMetricDef, 'mode' | 'peer_relative'>,
  context?: {
    sector?: string
    facts?: CompanyFacts
    peers?: PeerMedians | null
  },
): MetricInterpretation {
  const spec = metricUiSpec(metricId)
  const hints: MetricEvalHints | undefined = ev.hints
  const sub = ev.subscore
  const verdict = subscoreToVerdict(sub, ev.gatePass, def.mode)
  const vLabel = verdictLabel(verdict)
  const meterKind: MetricMeterKind =
    def.mode === 'gate' ? 'gate' : spec.meterKind === 'gate' ? 'gate' : spec.meterKind

  let meterPosition = clamp01(sub)
  let headline = ev.displayValue
  let formattedValue = ev.displayValue
  let subjectFormatted: string | undefined
  let peerFormatted: string | undefined
  let meterMinLabel = 'Worse'
  let meterMaxLabel = 'Better'
  let meterCenterLabel: string | undefined
  let sparkline: MetricSparkline | undefined

  const subject = hints?.subjectValue ?? hints?.absoluteValue
  const peer = hints?.peerMedian
  const unit = hints?.valueUnit ?? spec.valueUnit

  if (meterKind === 'gate') {
    meterPosition = ev.gatePass ? 0.85 : 0.15
    meterMinLabel = 'Fail'
    meterMaxLabel = 'Pass'
    headline = gateHeadline(metricId, ev.gatePass, ev.displayValue)
    formattedValue = ev.displayValue
  } else if (
    (meterKind === 'peer_lower_better' || meterKind === 'peer_higher_better') &&
    subject !== undefined &&
    peer !== undefined
  ) {
    const lowerBetter = meterKind === 'peer_lower_better'
    meterPosition = peerMeterPosition(subject, peer, lowerBetter)
    subjectFormatted = formatMetricValue(subject, unit)
    peerFormatted = formatMetricValue(peer, unit)
    formattedValue = `${subjectFormatted} vs peer ${peerFormatted}`
    meterMinLabel = lowerBetter ? 'Expensive' : 'Weaker'
    meterMaxLabel = lowerBetter ? 'Cheaper' : 'Stronger'
    meterCenterLabel = 'Peer median'
    headline = headlineForPeer(
      metricId.replace(/_vs_peer$/, '').replace(/_/g, ' '),
      subject,
      peer,
      lowerBetter,
      unit,
      verdict,
    )
  } else if (metricId === 'peg_ttm' && subject !== undefined && subject > 0) {
    const band = spec.absoluteBand!
    meterPosition = absoluteBandPosition(subject, band.min, band.max, band.invert ?? true)
    formattedValue = formatMetricValue(subject, 'multiple')
    meterMinLabel = '0'
    meterMaxLabel = '2.5'
    headline = pegHeadline(subject, verdict)
  } else if (metricId === 'gross_margin_stability_3y' && context?.facts) {
    const vol = grossMarginVolFromFacts(context.facts)
    sparkline = grossMarginSparkline(context.facts)
    if (vol !== undefined) {
      formattedValue = `~${fmtNum(vol, 1)} pp volatility`
      meterPosition = absoluteBandPosition(vol, 0, 12, true)
      meterMinLabel = 'Steady'
      meterMaxLabel = 'Volatile'
      headline =
        vol <= 2
          ? `Gross margin was very stable (~${fmtNum(vol, 1)} pp swing) — ${vLabel.toLowerCase()}.`
          : vol <= 5
            ? `Gross margin moved moderately (~${fmtNum(vol, 1)} pp) — ${vLabel.toLowerCase()}.`
            : `Gross margin was choppy (~${fmtNum(vol, 1)} pp) — ${vLabel.toLowerCase()} for stability.`
    }
  } else if (spec.absoluteBand && subject !== undefined) {
    const band = spec.absoluteBand
    meterPosition = absoluteBandPosition(subject, band.min, band.max, band.invert ?? false)
    formattedValue = formatMetricValue(subject, unit)
    meterMinLabel = formatMetricValue(band.min, unit)
    meterMaxLabel = formatMetricValue(band.max, unit)
    headline = `${formattedValue} on this measure — ${vLabel.toLowerCase()} under our rubric.`
  } else if (spec.absoluteScoreMax !== undefined && subject !== undefined) {
    meterPosition = clamp01(subject / spec.absoluteScoreMax)
    formattedValue = `${Math.round(subject)} / ${spec.absoluteScoreMax}`
    meterMinLabel = '0'
    meterMaxLabel = String(spec.absoluteScoreMax)
    headline = `Score ${formattedValue} — ${vLabel.toLowerCase()} on this checklist.`
  } else {
    meterPosition = clamp01(sub)
    meterMinLabel = 'Weak'
    meterMaxLabel = 'Strong'
    headline =
      verdict === 'unavailable'
        ? 'We could not score this line with enough data.'
        : `Overall ${vLabel.toLowerCase()} on this check (${Math.round(sub * 100)}% on our rubric). ${ev.displayValue}`
    formattedValue = ev.displayValue
  }

  if (metricId === 'rule_of_40' && context?.facts) {
    sparkline = revenueSparkline(context.facts)
  }

  return {
    verdict,
    verdictLabel: vLabel,
    headline,
    formattedValue,
    meterPosition,
    meterKind,
    meterMinLabel,
    meterMaxLabel,
    meterCenterLabel,
    tooltip: spec.tooltip,
    subjectFormatted,
    peerFormatted,
    sparkline,
  }
}

function buildValuationLine(
  id: string,
  label: string,
  tooltip: string,
  value: number | undefined,
  unit: MetricValueUnit,
  opts: {
    subscore: number
    headline?: string
    meterPosition?: number
    meterKind?: MetricMeterKind
    meterMinLabel?: string
    meterMaxLabel?: string
    sector?: string
    peerMedian?: number
    lowerBetter?: boolean
  },
): ValuationSummaryLine | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null
  const verdict = subscoreToVerdict(opts.subscore)
  const formattedValue = formatMetricValue(value, unit)
  let meterPosition = opts.meterPosition ?? clamp01(opts.subscore)
  let headline = opts.headline ?? `${label}: ${formattedValue}`
  let meterKind: MetricMeterKind = opts.meterKind ?? 'favorability'
  let meterMinLabel = opts.meterMinLabel ?? 'Expensive'
  let meterMaxLabel = opts.meterMaxLabel ?? 'Cheap'

  if (id === 'pe_trailing' && opts.sector) {
    const band = peBandForSector(opts.sector)
    meterPosition = peMeterFromBand(value, band)
    headline = peHeadline(value, band, label)
    meterKind = 'absolute_band'
    meterMinLabel = `${band.cheap}×`
    meterMaxLabel = `${band.expensive}×+`
  }

  if (opts.peerMedian !== undefined && opts.lowerBetter !== undefined) {
    meterKind = opts.lowerBetter ? 'peer_lower_better' : 'peer_higher_better'
    meterPosition = peerMeterPosition(value, opts.peerMedian, opts.lowerBetter)
    const peerFmt = formatMetricValue(opts.peerMedian, unit)
    headline = headlineForPeer(label, value, opts.peerMedian, opts.lowerBetter, unit, verdict)
    return {
      id,
      label,
      formattedValue: `${formattedValue} vs peer ${peerFmt}`,
      interpretation: {
        verdict,
        verdictLabel: verdictLabel(verdict),
        headline,
        formattedValue: `${formattedValue} vs peer ${peerFmt}`,
        meterPosition,
        meterKind,
        meterMinLabel: opts.lowerBetter ? 'Cheaper' : 'Weaker',
        meterMaxLabel: opts.lowerBetter ? 'Cheaper' : 'Stronger',
        meterCenterLabel: 'Peer median',
        tooltip,
        subjectFormatted: formattedValue,
        peerFormatted: peerFmt,
      },
    }
  }

  return {
    id,
    label,
    formattedValue,
    interpretation: {
      verdict,
      verdictLabel: verdictLabel(verdict),
      headline,
      formattedValue,
      meterPosition,
      meterKind,
      meterMinLabel,
      meterMaxLabel,
      tooltip,
    },
  }
}

type MetricValueUnit = import('./types').MetricValueUnit

export function buildValuationSummary(
  facts: CompanyFacts,
  peers: PeerMedians | null,
  sector?: string,
): ValuationSummary {
  const lines: ValuationSummaryLine[] = []

  const pe = facts.peTrailing
  if (pe !== undefined && pe > 0) {
    const band = peBandForSector(sector)
    const sub =
      pe <= band.fairHigh ? clamp01(0.55 + (band.fairHigh - pe) / (band.fairHigh - band.cheap + 1) * 0.35) : 0.35
    const row = buildValuationLine(
      VALUATION_ROW_SPECS.pe_trailing.id,
      VALUATION_ROW_SPECS.pe_trailing.label,
      VALUATION_ROW_SPECS.pe_trailing.tooltip,
      pe,
      VALUATION_ROW_SPECS.pe_trailing.valueUnit,
      { subscore: sub, sector },
    )
    if (row) lines.push(row)
  }

  const fw = facts.forwardPe
  const tr = facts.peTrailing
  if (fw !== undefined && fw > 0) {
    const sub = tr !== undefined && tr > 0 && fw < tr ? 0.78 : 0.45
    const row = buildValuationLine(
      VALUATION_ROW_SPECS.pe_forward.id,
      VALUATION_ROW_SPECS.pe_forward.label,
      VALUATION_ROW_SPECS.pe_forward.tooltip,
      fw,
      VALUATION_ROW_SPECS.pe_forward.valueUnit,
      {
        subscore: sub,
        headline:
          tr !== undefined && tr > 0
            ? fw < tr
              ? `Forward P/E ${fmtNum(fw, 1)}× is below trailing ${fmtNum(tr, 1)}× — market may expect earnings growth.`
              : `Forward P/E ${fmtNum(fw, 1)}× is at or above trailing ${fmtNum(tr, 1)}×.`
            : `Forward P/E ${fmtNum(fw, 1)}×.`,
      },
    )
    if (row) lines.push(row)
  }

  const peg = facts.pegRatio
  if (peg !== undefined && peg > 0) {
    const sub = clamp01(1 - peg / 2.5)
    const row = buildValuationLine(
      VALUATION_ROW_SPECS.peg.id,
      VALUATION_ROW_SPECS.peg.label,
      VALUATION_ROW_SPECS.peg.tooltip,
      peg,
      VALUATION_ROW_SPECS.peg.valueUnit,
      {
        subscore: sub,
        meterKind: 'absolute_band',
        meterPosition: absoluteBandPosition(peg, 0, 2.5, true),
        meterMinLabel: '0',
        meterMaxLabel: '2.5',
        headline: pegHeadline(peg, subscoreToVerdict(sub)),
      },
    )
    if (row) lines.push(row)
  }

  const evE = facts.evToEbitda
  if (evE !== undefined && evE > 0 && peers?.evToEbitda !== undefined) {
    const sub = peerMeterPosition(evE, peers.evToEbitda, true)
    const row = buildValuationLine(
      VALUATION_ROW_SPECS.ev_ebitda.id,
      VALUATION_ROW_SPECS.ev_ebitda.label,
      VALUATION_ROW_SPECS.ev_ebitda.tooltip,
      evE,
      VALUATION_ROW_SPECS.ev_ebitda.valueUnit,
      { subscore: sub, peerMedian: peers.evToEbitda, lowerBetter: true },
    )
    if (row) lines.push(row)
  }

  const evB = facts.evToEbit
  if (evB !== undefined && evB > 0 && peers?.evToEbit !== undefined) {
    const sub = peerMeterPosition(evB, peers.evToEbit, true)
    const row = buildValuationLine(
      VALUATION_ROW_SPECS.ev_ebit.id,
      VALUATION_ROW_SPECS.ev_ebit.label,
      VALUATION_ROW_SPECS.ev_ebit.tooltip,
      evB,
      VALUATION_ROW_SPECS.ev_ebit.valueUnit,
      { subscore: sub, peerMedian: peers.evToEbit, lowerBetter: true },
    )
    if (row) lines.push(row)
  }

  return { lines, sectorLabel: sector?.trim() || undefined }
}
