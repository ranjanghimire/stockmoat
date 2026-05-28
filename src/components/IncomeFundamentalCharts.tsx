import { useMemo, useState } from 'react'
import { barHeightPercents, barHeightRem } from '../lib/chartBarScale'
import type { IncomeChartPoint, IncomeFundamentalsCharts } from '../lib/moatFundamentalsSnapshot'

type PeriodMode = 'yearly' | 'quarterly'

function formatUsd(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function pickValue(p: IncomeChartPoint, kind: 'eps' | 'revenue' | 'netIncome'): number | undefined {
  if (kind === 'eps') return p.eps
  if (kind === 'revenue') return p.revenue
  return p.netIncome
}

function BarGroup({
  title,
  points,
  formatValue,
  kind,
}: {
  title: string
  points: IncomeChartPoint[]
  formatValue: (v: number | undefined) => string
  kind: 'eps' | 'revenue' | 'netIncome'
}) {
  const values = useMemo(() => points.map((p) => pickValue(p, kind)), [points, kind])
  const heights = useMemo(() => barHeightPercents(values), [values])

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-inner backdrop-blur">
      <h4 className="text-sm font-semibold text-moat-ink">{title}</h4>
      <div className="mt-3 flex h-36 items-end gap-1.5 sm:gap-2">
        {points.map((p, i) => {
          const v = values[i]
          const h = heights[i] ?? 0
          const has = v !== undefined && Number.isFinite(v)
          const barRem = barHeightRem(h, has, 9)
          return (
            <div key={`${p.date}-${p.label}-${i}`} className="flex h-36 min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div
                className={`w-full max-w-[3rem] rounded-t-md transition ${has ? 'bg-moat-accent/90' : 'bg-slate-200'}`}
                style={{ height: `${barRem}rem` }}
                title={`${p.label}: ${formatValue(v)}`}
              />
              <span className="max-w-full truncate text-center text-[10px] font-medium text-slate-500" title={p.label}>
                {p.label}
              </span>
              <span className="max-w-full truncate text-center text-[10px] text-slate-600">{formatValue(v)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface IncomeFundamentalChartsProps {
  charts: IncomeFundamentalsCharts
}

export function IncomeFundamentalCharts({ charts }: IncomeFundamentalChartsProps) {
  const [mode, setMode] = useState<PeriodMode>(() =>
    charts.yearly.length > 0 ? 'yearly' : 'quarterly',
  )

  const points: IncomeChartPoint[] = mode === 'yearly' ? charts.yearly : charts.quarterly
  const otherEmpty = mode === 'yearly' ? charts.quarterly.length === 0 : charts.yearly.length === 0

  if (points.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white/60 p-4 text-sm text-slate-600 shadow-sm backdrop-blur">
        <p className="font-medium text-moat-ink">Income trends</p>
        <p className="mt-1 text-xs text-slate-500">
          No {mode === 'yearly' ? 'annual' : 'quarterly'} income statement periods in the loaded pack.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-xl text-moat-ink">Income trends</h3>
          <p className="text-xs text-slate-500">EPS, net income, and revenue by period (from income statements).</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold shadow-inner">
          <button
            type="button"
            onClick={() => setMode('quarterly')}
            disabled={charts.quarterly.length === 0}
            className={`rounded-md px-3 py-1.5 transition ${
              mode === 'quarterly'
                ? 'bg-moat-ink text-white'
                : 'text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'
            }`}
          >
            Quarterly
          </button>
          <button
            type="button"
            onClick={() => setMode('yearly')}
            disabled={charts.yearly.length === 0}
            className={`rounded-md px-3 py-1.5 transition ${
              mode === 'yearly'
                ? 'bg-moat-ink text-white'
                : 'text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>
      {otherEmpty ? (
        <p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          {mode === 'quarterly' ? 'Annual' : 'Quarterly'} series not available in this data path.
        </p>
      ) : null}
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <BarGroup title="EPS" points={points} formatValue={(v) => (v === undefined ? '—' : v.toFixed(2))} kind="eps" />
        <BarGroup
          title="Net income"
          points={points}
          formatValue={(v) => (v === undefined ? '—' : formatUsd(v))}
          kind="netIncome"
        />
        <BarGroup
          title="Total revenue"
          points={points}
          formatValue={(v) => (v === undefined ? '—' : formatUsd(v))}
          kind="revenue"
        />
      </div>
    </section>
  )
}
