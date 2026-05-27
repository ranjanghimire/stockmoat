/** User-facing quality band for a metric line. */
export type MetricVerdict = 'strong' | 'good' | 'fair' | 'weak' | 'poor' | 'unavailable' | 'pass' | 'fail'

export type MetricMeterKind =
  | 'favorability'
  | 'peer_lower_better'
  | 'peer_higher_better'
  | 'absolute_band'
  | 'gate'

export type MetricValueUnit = 'multiple' | 'percent_decimal' | 'percent_points' | 'ratio' | 'plain'

export interface MetricEvalHints {
  subjectValue?: number
  peerMedian?: number
  absoluteValue?: number
  valueUnit?: MetricValueUnit
}

export interface MetricSparkline {
  values: number[]
  labels?: string[]
  /** Short caption, e.g. "Annual gross margin" */
  caption?: string
}

export interface MetricInterpretation {
  verdict: MetricVerdict
  verdictLabel: string
  headline: string
  formattedValue: string
  meterPosition: number
  meterKind: MetricMeterKind
  meterMinLabel: string
  meterMaxLabel: string
  meterCenterLabel?: string
  tooltip: string
  subjectFormatted?: string
  peerFormatted?: string
  sparkline?: MetricSparkline
}

export interface ValuationSummaryLine {
  id: string
  label: string
  formattedValue: string
  interpretation: MetricInterpretation
  sparkline?: MetricSparkline
}

export interface ValuationSummary {
  lines: ValuationSummaryLine[]
  sectorLabel?: string
}
