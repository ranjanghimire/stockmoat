import { Link } from 'react-router-dom'
import { CandlestickChart } from './CandlestickChart'
import { useChartBookmarks } from '../hooks/useChartBookmarks'
import type { ChartTimeframe } from '../lib/chartBookmarks'
import type { OhlcvBar, PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'
import '../styles/chartGallery.css'

function formatAxisDate(t: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(t))
  } catch {
    return ''
  }
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="chart-gallery-bookmark-btn__icon" viewBox="0 0 24 24" aria-hidden>
      {filled ? (
        <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3.5L6 21V4.5z" />
      ) : (
        <path
          d="M8.5 3.5h7A1.5 1.5 0 0 1 17 5v13.8l-5-2.9-5 2.9V5a1.5 1.5 0 0 1 1.5-1.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function ChartBookmarkButton({ symbol, timeframe }: { symbol: string; timeframe: ChartTimeframe }) {
  const { isBookmarked, toggle } = useChartBookmarks()
  const active = isBookmarked(symbol, timeframe)
  const label =
    timeframe === 'weekly'
      ? `Bookmark weekly chart for ${symbol}`
      : `Bookmark daily chart for ${symbol}`

  return (
    <button
      type="button"
      className={`chart-gallery-bookmark-btn${active ? ' chart-gallery-bookmark-btn--active' : ''}`}
      aria-pressed={active}
      aria-label={active ? `Remove ${timeframe} bookmark for ${symbol}` : label}
      title={active ? 'Remove bookmark' : 'Bookmark this chart'}
      onClick={() => toggle(symbol, timeframe)}
    >
      <BookmarkIcon filled={active} />
    </button>
  )
}

function ChartTile({
  symbol,
  timeframe,
  label,
  bars,
  currency,
}: {
  symbol: string
  timeframe: ChartTimeframe
  label: string
  bars: OhlcvBar[]
  currency: string
}) {
  const firstLast = bars.length > 0 ? { a: bars[0]!, b: bars[bars.length - 1]! } : null

  return (
    <div className="chart-gallery-tile">
      <div className="chart-gallery-tile__head">
        <p className="chart-gallery-tile__label">{label}</p>
        <ChartBookmarkButton symbol={symbol} timeframe={timeframe} />
      </div>
      {bars.length > 0 ? (
        <>
          <CandlestickChart bars={bars} currency={currency} />
          {firstLast ? (
            <div className="chart-gallery-tile__dates">
              <span>{formatAxisDate(firstLast.a.t)}</span>
              <span>{formatAxisDate(firstLast.b.t)}</span>
            </div>
          ) : null}
        </>
      ) : (
        <p className="py-4 text-center text-xs text-slate-500">No {timeframe} bars</p>
      )}
    </div>
  )
}

export function ChartGalleryTickerBlock({
  symbol,
  displayName,
  data,
  error,
  showWeekly = true,
  showDaily = true,
}: {
  symbol: string
  displayName?: string | null
  data: PriceChartsPayload | null
  error: string | null
  showWeekly?: boolean
  showDaily?: boolean
}) {
  const sym = symbol.trim().toUpperCase()
  const name = displayName?.trim()
  const showSubtitle = name && name.toUpperCase() !== sym

  return (
    <article className="chart-gallery-ticker" aria-label={`Charts for ${sym}`}>
      <header className="chart-gallery-ticker__header">
        <Link to={`/?ticker=${encodeURIComponent(sym)}`} className="chart-gallery-ticker__symbol-link">
          <span className="chart-gallery-ticker__symbol-code">{sym}</span>
          {showSubtitle ? <span className="chart-gallery-ticker__display-name">{name}</span> : null}
        </Link>
      </header>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">{error}</p>
      ) : null}

      {!error && data ? (
        <div className="chart-gallery-ticker__grid">
          {showWeekly ? (
            <ChartTile
              symbol={sym}
              timeframe="weekly"
              label="Weekly · ~2y"
              bars={data.weekly}
              currency={data.currency}
            />
          ) : null}
          {showDaily ? (
            <ChartTile
              symbol={sym}
              timeframe="daily"
              label="Daily · ~6mo"
              bars={data.daily}
              currency={data.currency}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
