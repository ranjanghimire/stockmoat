import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'
import { CandlestickChart } from './CandlestickChart'

function formatAxisDate(t: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(t))
  } catch {
    return ''
  }
}

export function PriceChartsPanel({
  ticker,
  data,
  loading,
  error,
  contextNote,
}: {
  ticker: string
  data: PriceChartsPayload | null
  loading: boolean
  error: string | null
  /** When set (e.g. Screener nightly snapshot), replaces the small-print provider explanation. */
  contextNote?: string
}) {
  const wFirstLast =
    data?.weekly.length && data.weekly.length > 0
      ? { a: data.weekly[0]!, b: data.weekly[data.weekly.length - 1]! }
      : null
  const dFirstLast =
    data?.daily.length && data.daily.length > 0
      ? { a: data.daily[0]!, b: data.daily[data.daily.length - 1]! }
      : null

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base text-moat-ink">Price snapshot</h3>
        <p className="text-[11px] text-slate-500">
          {data?.chartProvider === 'yahoo'
            ? 'Yahoo (fallback)'
            : data?.chartProvider === 'fmp'
              ? 'FMP'
              : '—'}{' '}
          · <span className="font-mono">{ticker}</span>
          {data?.currency ? ` · ${data.currency}` : null}
        </p>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        {contextNote
          ? contextNote
          : !data
            ? 'Weekly ~2y and daily ~6mo (OHLC). FMP when configured; Yahoo if FMP fails.'
            : data.chartProvider === 'yahoo'
              ? 'Yahoo-native intervals; shown when FMP history could not be loaded.'
              : 'Dividend-adjusted daily EOD from FMP; weekly = ISO week rollup.'}
      </p>

      {loading ? (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="h-[16rem] animate-pulse rounded-lg bg-slate-100/90" aria-busy="true" />
          <div className="h-[16rem] animate-pulse rounded-lg bg-slate-100/90" aria-busy="true" />
        </div>
      ) : null}

      {error && !loading ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">{error}</p>
      ) : null}

      {!loading && !error && data ? (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200/60 bg-white/50 px-2 py-1.5">
            <p className="text-[11px] font-semibold text-slate-700">Weekly · ~2y</p>
            {data.weekly.length > 0 ? (
              <>
                <CandlestickChart bars={data.weekly} currency={data.currency} />
                {wFirstLast ? (
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{formatAxisDate(wFirstLast.a.t)}</span>
                    <span>{formatAxisDate(wFirstLast.b.t)}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="py-4 text-center text-xs text-slate-500">No weekly bars</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200/60 bg-white/50 px-2 py-1.5">
            <p className="text-[11px] font-semibold text-slate-700">Daily · ~6mo</p>
            {data.daily.length > 0 ? (
              <>
                <CandlestickChart bars={data.daily} currency={data.currency} />
                {dFirstLast ? (
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{formatAxisDate(dFirstLast.a.t)}</span>
                    <span>{formatAxisDate(dFirstLast.b.t)}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="py-4 text-center text-xs text-slate-500">No daily bars</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
