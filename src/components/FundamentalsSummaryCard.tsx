import type { MoatFundamentalsSnapshot } from '../lib/moatFundamentalsSnapshot'
import { formatDividendYieldDecimal } from '../lib/moatFundamentalsSnapshot'

function formatMarketCap(usd: number): string {
  const abs = Math.abs(usd)
  if (abs >= 1e12) return `$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(1)}K`
  return `$${abs.toFixed(0)}`
}

interface FundamentalsSummaryCardProps {
  fundamentals: MoatFundamentalsSnapshot
}

export function FundamentalsSummaryCard({ fundamentals: f }: FundamentalsSummaryCardProps) {
  const hasMc = f.marketCapUsd !== undefined && Number.isFinite(f.marketCapUsd) && f.marketCapUsd > 0
  const hasDiv = f.dividendYield !== undefined && Number.isFinite(f.dividendYield)

  if (!hasMc && !hasDiv) return null

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-md shadow-slate-900/5 backdrop-blur md:p-5">
      <h3 className="font-display text-lg text-moat-ink">Market snapshot</h3>
      <p className="mt-0.5 text-xs text-slate-500">Quote-based figures from the same data pull as the moat score.</p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {hasMc ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Market cap (estimate)</dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-moat-ink">{formatMarketCap(f.marketCapUsd!)}</dd>
            <dd className="mt-1 text-sm font-medium text-moat-accent">{f.marketCapTierLabel ?? '—'}</dd>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Large at least $10B · Mid $2B-$10B · Small under $2B (rough buckets from current market cap).
            </p>
          </div>
        ) : null}
        {hasDiv ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dividend yield (TTM)</dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-moat-ink">{formatDividendYieldDecimal(f.dividendYield!)}</dd>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">From key metrics / ratios when the feed provides it; zero if non-dividend payers.</p>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
