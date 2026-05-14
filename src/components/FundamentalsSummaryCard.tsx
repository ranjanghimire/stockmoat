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
  /** When `yahoo_dev`, analyst counts are not in the pack — explain in UI. */
  dataSource?: 'fmp' | 'demo' | 'yahoo_dev'
}

function AnalystStanceBlock({ a }: { a: NonNullable<MoatFundamentalsSnapshot['analystRecommendations']> }) {
  const t = a.totalAnalysts
  const seg = (n: number) => (t > 0 ? Math.max(0, Math.round((n / t) * 1000) / 10) : 0)
  const parts: { label: string; n: number; pct: number; className: string }[] = [
    { label: 'Strong buy', n: a.strongBuy, pct: seg(a.strongBuy), className: 'bg-emerald-600' },
    { label: 'Buy', n: a.buy, pct: seg(a.buy), className: 'bg-emerald-500/90' },
    { label: 'Hold', n: a.hold, pct: seg(a.hold), className: 'bg-slate-400' },
    { label: 'Sell', n: a.sell, pct: seg(a.sell), className: 'bg-rose-400' },
    { label: 'Strong sell', n: a.strongSell, pct: seg(a.strongSell), className: 'bg-rose-600' },
  ]

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 sm:col-span-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Analyst stance (FMP)</dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xl font-semibold text-moat-ink">{a.consensusLabel}</span>
        <span className="text-sm text-slate-500">
          {a.asOfDate ? `as of ${a.asOfDate}` : 'latest row'}
          {t > 0 ? ` · ${t} analyst${t === 1 ? '' : 's'}` : null}
        </span>
      </dd>
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
        {parts.map((p) =>
          p.n > 0 ? (
            <div
              key={p.label}
              className={`${p.className} min-w-0 shrink-0 transition-[width]`}
              style={{ width: `${p.pct}%` }}
              title={`${p.label}: ${p.n}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {parts.map((p) => (
          <li key={p.label}>
            <span className="font-medium text-moat-ink">{p.n}</span> {p.label.toLowerCase()}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Counts from Financial Modeling Prep (`/stable/analyst-stock-recommendations` or `/stable/grades-consensus`).
        Consensus uses a weighted average of the five buckets (strong buy = 5 … strong sell = 1).
      </p>
    </div>
  )
}

export function FundamentalsSummaryCard({ fundamentals: f, dataSource }: FundamentalsSummaryCardProps) {
  const hasMc = f.marketCapUsd !== undefined && Number.isFinite(f.marketCapUsd) && f.marketCapUsd > 0
  const hasDiv = f.dividendYield !== undefined && Number.isFinite(f.dividendYield)
  const hasAnalyst = f.analystRecommendations !== undefined && f.analystRecommendations.totalAnalysts > 0
  const showYahooAnalystHint = dataSource === 'yahoo_dev'

  if (!hasMc && !hasDiv && !hasAnalyst && !showYahooAnalystHint) return null

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-md shadow-slate-900/5 backdrop-blur md:p-5">
      <h3 className="font-display text-lg text-moat-ink">Market snapshot</h3>
      <p className="mt-0.5 text-xs text-slate-500">Quote-based figures from the same data pull as the moat score.</p>
      {showYahooAnalystHint ? (
        <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950">
          <span className="font-semibold">Analyst stance (FMP)</span> is not loaded on the Yahoo dev path. Remove{' '}
          <code className="rounded bg-white/80 px-1 font-mono text-[11px]">VITE_USE_YAHOO=true</code> from{' '}
          <code className="rounded bg-white/80 px-1 font-mono text-[11px]">.env.local</code>, restart Vite, and use your
          FMP key so buy / hold / sell counts can appear here.
        </p>
      ) : null}
      {dataSource === 'fmp' && (hasMc || hasDiv) && !hasAnalyst ? (
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          FMP returned no usable analyst rating breakdown for this symbol (empty payload, plan limits, or try{' '}
          <span className="font-medium">Refresh</span> after confirming your subscription includes analyst / grades data).
        </p>
      ) : null}
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
        {hasAnalyst && f.analystRecommendations ? <AnalystStanceBlock a={f.analystRecommendations} /> : null}
      </dl>
    </section>
  )
}
