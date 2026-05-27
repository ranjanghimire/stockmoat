import { useMemo } from 'react'
import type { ForwardGrowthChartPoint, ForwardGrowthCharts } from '../lib/fmp/parseForwardEstimates'
import './forwardGrowthCharts.css'

function formatUsd(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function barPercents(values: Array<number | undefined>): number[] {
  const nums = values.filter((v): v is number => v !== undefined && Number.isFinite(v))
  if (nums.length === 0) return values.map(() => 0)
  const lo = Math.min(0, ...nums)
  const hi = Math.max(0, ...nums)
  const span = hi - lo || 1
  return values.map((v) => {
    if (v === undefined || !Number.isFinite(v)) return 0
    return ((v - lo) / span) * 100
  })
}

function yoyPct(cur?: number, prev?: number): string | undefined {
  if (cur === undefined || prev === undefined || !Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) {
    return undefined
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}% YoY`
}

function barClassForPoint(point: ForwardGrowthChartPoint, estimateMetricClass: string): string {
  if (point.kind === 'actual') {
    return estimateMetricClass.includes('eps')
      ? 'forward-growth-chart__bar--actual forward-growth-chart__bar--eps'
      : 'forward-growth-chart__bar--actual'
  }
  return `forward-growth-chart__bar ${estimateMetricClass}`.trim()
}

function ForwardBarGroup({
  title,
  points,
  values,
  formatValue,
  estimateMetricClass,
  analystLabel,
}: {
  title: string
  points: ForwardGrowthChartPoint[]
  values: Array<number | undefined>
  formatValue: (v: number | undefined) => string
  estimateMetricClass: string
  analystLabel?: (p: ForwardGrowthChartPoint) => string | undefined
}) {
  const heights = useMemo(() => barPercents(values), [values])

  return (
    <div className="forward-growth-chart__card">
      <h4 className="text-sm font-semibold text-moat-ink">{title}</h4>
      <div className="forward-growth-chart__plot">
        {points.map((p, i) => {
          const v = values[i]
          const h = heights[i] ?? 0
          const has = v !== undefined && Number.isFinite(v)
          const barRem = has ? Math.max(0.25, (h / 100) * 7.5) : 0.2
          const prev = i > 0 ? values[i - 1] : undefined
          const yoy = yoyPct(v, prev)
          const analysts = analystLabel?.(p)
          return (
            <div key={`${p.fiscalYear}-${title}`} className="forward-growth-chart__column">
              <div className="forward-growth-chart__bar-area">
                <div
                  className={barClassForPoint(p, estimateMetricClass)}
                  style={{ height: `${barRem}rem` }}
                  title={[
                    p.label,
                    p.kind === 'actual' ? 'Reported' : 'Consensus',
                    formatValue(v),
                    yoy,
                    analysts,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </div>
              <div className="forward-growth-chart__labels">
                <span className="forward-growth-chart__label-year" title={p.label}>
                  {p.label}
                </span>
                <span className="forward-growth-chart__label-value">{formatValue(v)}</span>
                {yoy ? <span className="forward-growth-chart__label-yoy">{yoy}</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ForwardGrowthChartsProps {
  charts: ForwardGrowthCharts
}

export function ForwardGrowthCharts({ charts }: ForwardGrowthChartsProps) {
  const points = charts.points
  const hasRevenue = points.some((p) => p.revenueUsd !== undefined)
  const hasEps = points.some((p) => p.eps !== undefined)

  if (!hasRevenue && !hasEps) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white/60 p-4 text-sm text-slate-600 shadow-sm backdrop-blur">
        <p className="font-medium text-moat-ink">Forward growth (consensus)</p>
        <p className="mt-1 text-xs text-slate-500">No forward analyst estimates available for this symbol on your data plan.</p>
      </section>
    )
  }

  const revenueValues = points.map((p) => p.revenueUsd)
  const epsValues = points.map((p) => p.eps)

  return (
    <section className="rounded-2xl border border-sky-200/60 bg-gradient-to-b from-sky-50/50 to-white/90 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="flex flex-col gap-2 border-b border-sky-100/90 bg-sky-50/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl text-moat-ink">Forward growth (consensus)</h3>
            <span className="forward-growth-chart__badge">FMP analysts</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
            Five fiscal years at a glance: two reported years from financial statements (gray) and three forward
            analyst consensus years (color). YoY % compares each bar to the prior year.
          </p>
          <div className="forward-growth-chart__legend">
            <span className="forward-growth-chart__legend-item">
              <span className="forward-growth-chart__legend-swatch forward-growth-chart__legend-swatch--actual" />
              Reported
            </span>
            <span className="forward-growth-chart__legend-item">
              <span className="forward-growth-chart__legend-swatch forward-growth-chart__legend-swatch--revenue" />
              Consensus (revenue)
            </span>
            <span className="forward-growth-chart__legend-item">
              <span className="forward-growth-chart__legend-swatch forward-growth-chart__legend-swatch--eps" />
              Consensus (EPS)
            </span>
          </div>
        </div>
        {charts.asOf ? (
          <p className="shrink-0 text-[10px] text-slate-500">Estimate rows through {charts.asOf}</p>
        ) : null}
      </div>

      <div className={`grid gap-4 p-4 ${hasRevenue && hasEps ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
        {hasRevenue ? (
          <ForwardBarGroup
            title="Revenue"
            points={points}
            values={revenueValues}
            formatValue={(v) => (v === undefined ? '—' : formatUsd(v))}
            estimateMetricClass=""
            analystLabel={(p) =>
              p.kind === 'estimate' && p.revenueAnalystCount !== undefined
                ? `${p.revenueAnalystCount} analysts`
                : undefined
            }
          />
        ) : null}
        {hasEps ? (
          <ForwardBarGroup
            title="EPS"
            points={points}
            values={epsValues}
            formatValue={(v) => (v === undefined ? '—' : `$${v!.toFixed(2)}`)}
            estimateMetricClass="forward-growth-chart__bar--eps"
            analystLabel={(p) =>
              p.kind === 'estimate' && p.epsAnalystCount !== undefined ? `${p.epsAnalystCount} analysts` : undefined
            }
          />
        ) : null}
      </div>

      <p className="border-t border-sky-100/90 px-4 py-2 text-[11px] leading-snug text-slate-500">
        Source: FMP annual income statements (reported) and analyst-estimates (consensus). Not company guidance or
        investment advice.
      </p>
    </section>
  )
}
