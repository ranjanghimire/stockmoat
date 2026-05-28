/** Minimum bar height (% of plot) so the smallest value stays visible. */
export const MIN_BAR_PERCENT = 14

function scaleBounds(nums: number[]): { lo: number; hi: number } {
  const dataLo = Math.min(...nums)
  const dataHi = Math.max(...nums)
  if (dataLo >= 0) return { lo: 0, hi: dataHi }
  if (dataHi <= 0) return { lo: dataLo, hi: dataHi }
  return { lo: dataLo, hi: dataHi }
}

/**
 * Map values to 0–100 bar heights within the plot.
 * All-positive series anchor at 0; all-negative use data min→max (not zero).
 */
export function barHeightPercents(values: Array<number | undefined>): number[] {
  const nums = values.filter((v): v is number => v !== undefined && Number.isFinite(v))
  if (nums.length === 0) return values.map(() => 0)

  const { lo, hi } = scaleBounds(nums)
  const span = hi - lo || 1

  return values.map((v) => {
    if (v === undefined || !Number.isFinite(v)) return 0
    let pct = ((v - lo) / span) * 100
    if (pct < MIN_BAR_PERCENT) pct = MIN_BAR_PERCENT
    return pct
  })
}

/** Plot height in rem (must match `.forward-growth-chart__bar-area` / income chart area). */
export const CHART_BAR_AREA_REM = 7.5

export function barHeightRem(percent: number, hasValue: boolean, maxRem = CHART_BAR_AREA_REM): number {
  if (!hasValue) return 0.2
  if (percent <= 0) return 0.15
  return Math.max(0.25, (percent / 100) * maxRem)
}
