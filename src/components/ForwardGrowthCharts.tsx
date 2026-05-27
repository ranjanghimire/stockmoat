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

function ForwardBarGroup({
  title,
  points,
  values,
  formatValue,
  barClassName,
  analystLabel,
}: {
  title: string
  points: ForwardGrowthChartPoint[]
  values: Array<number | undefined>
  formatValue: (v: number | undefined) => string
  barClassName: string
  analystLabel?: (p: ForwardGrowthChartPoint) => string | undefined
}) {
  const heights = useMemo(() => barPercents(values), [values])

  return (
    <div className="rounded-xl border border-sky-200/80 bg-white/70 p-4 shadow-inner backdrop-blur">
      <h4 className="text-sm font-semibold text-moat-ink">{title}</h4>
      <div className="mt-3 flex h-36 items-end gap-1.5 sm:gap-2">
        {points.map((p, i) => {
          const v = values[i]
          const h = heights[i] ?? 0
          const has = v !== undefined && Number.isFinite(v)
          const barRem = has ? Math.max(0.25, (h / 100) * 9) : 0.2
          const prev = i > 0 ? values[i - 1] : undefined
          const yoy = yoyPct(v, prev)
          const analysts = analystLabel?.(p)
          return (
            <div
              key={`${p.fiscalYear}-${title}`}
              className="flex h-36 min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                className={`forward-growth-chart__bar w-full max-w-[3rem] rounded-t-md transition ${barClassName}`}
                style={{ height: `${barRem}rem` }}
                title={[p.label, formatValue(v), yoy, analysts].filter(Boolean).join(' · ')}
              />
              <span className="max-w-full truncate text-center text-[10px] font-semibold text-sky-900" title={p.label}>
                {p.label}
              </span>
              <span className="max-w-full truncate text-center text-[10px] text-slate-600">{formatValue(v)}</span>
              {yoy ? <span className="text-center text-[9px] font-medium text-slate-500">{yoy}</span> : null}
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
    <section className="overflow-hidden rounded-2xl border border-sky-200/60 bg-gradient-to-b from-sky-50/50 to-white/90 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="flex flex-col gap-2 border-b border-sky-100/90 bg-sky-50/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl text-moat-ink">Forward growth (consensus)</h3>
            <span className="forward-growth-chart__badge">FMP analysts</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
            Wall Street consensus for upcoming fiscal years — not historical actuals. Revenue and EPS are shown
            separately; YoY % compares one estimate year to the next.
          </p>
        </div>
        {charts.asOf ? (
          <p className="shrink-0 text-[10px] text-slate-500">Estimate rows through {charts.asOf}</p>
        ) : null}
      </div>

      <div className={`grid gap-4 p-4 ${hasRevenue && hasEps ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
        {hasRevenue ? (
          <ForwardBarGroup
            title="Revenue (consensus)"
            points={points}
            values={revenueValues}
            formatValue={(v) => (v === undefined ? '—' : formatUsd(v))}
            barClassName=""
            analystLabel={(p) =>
              p.revenueAnalystCount !== undefined ? `${p.revenueAnalystCount} analysts` : undefined
            }
          />
        ) : null}
        {hasEps ? (
          <ForwardBarGroup
            title="EPS (consensus)"
            points={points}
            values={epsValues}
            formatValue={(v) => (v === undefined ? '—' : `$${v!.toFixed(2)}`)}
            barClassName="forward-growth-chart__bar--eps"
            analystLabel={(p) => (p.epsAnalystCount !== undefined ? `${p.epsAnalystCount} analysts` : undefined)}
          />
        ) : null}
      </div>

      <p className="border-t border-sky-100/90 px-4 py-2 text-[11px] leading-snug text-slate-500">
        Source: Financial Modeling Prep analyst-estimates (annual). Figures are illustrative consensus, not company
        guidance or investment advice.
      </p>
    </section>
  )
}
