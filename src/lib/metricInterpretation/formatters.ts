import type { MetricValueUnit } from './types'

export function fmtNum(x: number | undefined, digits = 2): string {
  if (x === undefined || !Number.isFinite(x)) return '—'
  return x.toFixed(digits)
}

export function formatMetricValue(
  value: number | undefined,
  unit: MetricValueUnit = 'plain',
  digits = 2,
): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  switch (unit) {
    case 'percent_decimal':
      return `${(value * 100).toFixed(digits)}%`
    case 'percent_points':
      return `${value.toFixed(digits)}%`
    case 'multiple':
      return `${value.toFixed(digits)}×`
    case 'ratio':
      return `${value.toFixed(digits)}×`
    default:
      return value.toFixed(digits)
  }
}

export function formatPeerRatio(subject?: number, peer?: number, unit: MetricValueUnit = 'multiple'): string {
  if (
    subject === undefined ||
    peer === undefined ||
    !Number.isFinite(subject) ||
    !Number.isFinite(peer) ||
    peer <= 0
  ) {
    return ''
  }
  const rel = subject / peer
  if (!Number.isFinite(rel)) return ''
  if (rel >= 1.05) return `about ${rel.toFixed(1)}× peer level`
  if (rel <= 0.95) return `about ${(1 / rel).toFixed(1)}× better than peers`
  return 'in line with peers'
}
