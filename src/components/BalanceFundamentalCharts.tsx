import { useMemo, useState } from 'react'
import type { BalanceChartPoint, BalanceFundamentalsCharts } from '../lib/moatFundamentalsSnapshot'

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

function scaleHeights(points: BalanceChartPoint[]): { assets: number[]; liabilities: number[] } {
  const nums: number[] = []
  for (const p of points) {
    nums.push(p.totalAssets, p.totalLiabilities)
  }
  const finite = nums.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { assets: points.map(() => 0), liabilities: points.map(() => 0) }
  const lo = Math.min(0, ...finite)
  const hi = Math.max(0, ...finite)
  const span = hi - lo || 1
  const toPct = (v: number) => ((v - lo) / span) * 100
  return {
    assets: points.map((p) => toPct(p.totalAssets)),
    liabilities: points.map((p) => toPct(p.totalLiabilities)),
  }
}

interface BalanceFundamentalChartsProps {
  charts: BalanceFundamentalsCharts
}

export function BalanceFundamentalCharts({ charts }: BalanceFundamentalChartsProps) {
  const [mode, setMode] = useState<PeriodMode>(() =>
    charts.yearly.length > 0 ? 'yearly' : 'quarterly',
  )

  const points: BalanceChartPoint[] = mode === 'yearly' ? charts.yearly : charts.quarterly
  const otherEmpty = mode === 'yearly' ? charts.quarterly.length === 0 : charts.yearly.length === 0

  const { assets: hA, liabilities: hL } = useMemo(() => scaleHeights(points), [points])

  if (points.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white/60 p-4 text-sm text-slate-600 shadow-sm backdrop-blur">
        <h3 className="font-display text-xl text-moat-ink">Assets and liabilities</h3>
        <p className="mt-1 text-xs text-slate-500">
          No {mode === 'yearly' ? 'annual' : 'quarterly'} balance sheet periods in the loaded pack.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-xl text-moat-ink">Assets and liabilities</h3>
          <p className="text-xs text-slate-500">
            Total assets vs total liabilities by period (two bars per period). Liabilities from statements, or assets
            minus equity when liabilities are not reported.
          </p>
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
          {mode === 'quarterly' ? 'Annual' : 'Quarterly'} balance series not available in this data path.
        </p>
      ) : null}
      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-600/90" /> Assets
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-700/85" /> Liabilities
          </span>
        </div>
        <div className="flex h-40 items-end gap-1.5 sm:gap-2">
          {points.map((p, i) => {
            const a = hA[i] ?? 0
            const l = hL[i] ?? 0
            const barA = Math.max(0.25, (a / 100) * 9)
            const barL = Math.max(0.25, (l / 100) * 9)
            return (
              <div key={`${p.date}-${p.label}-${i}`} className="flex h-40 min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-36 w-full max-w-[4.5rem] items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 max-w-[1.75rem] rounded-t-md bg-sky-600/90"
                    style={{ height: `${barA}rem` }}
                    title={`Assets ${formatUsd(p.totalAssets)}`}
                  />
                  <div
                    className="w-1/2 max-w-[1.75rem] rounded-t-md bg-amber-700/85"
                    style={{ height: `${barL}rem` }}
                    title={`Liabilities ${formatUsd(p.totalLiabilities)}`}
                  />
                </div>
                <span className="max-w-full truncate text-center text-[10px] font-medium text-slate-500" title={p.label}>
                  {p.label}
                </span>
                <span className="max-w-full truncate text-center text-[9px] leading-tight text-slate-500">
                  A {formatUsd(p.totalAssets)}
                </span>
                <span className="max-w-full truncate text-center text-[9px] leading-tight text-slate-500">
                  L {formatUsd(p.totalLiabilities)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
