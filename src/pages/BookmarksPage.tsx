import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartGalleryTickerBlock } from '../components/ChartGalleryTickerBlock'
import { useChartBookmarks } from '../hooks/useChartBookmarks'
import { parseChartPanel, type ScoreWithChartRow } from '../lib/screenCharts'
import { getSupabaseBrowserClient } from '../lib/supabaseClient'
import '../styles/chartGallery.css'

export default function BookmarksPage() {
  const { symbolsGrouped, timeframesFor, count } = useChartBookmarks()
  const [rowsBySymbol, setRowsBySymbol] = useState<Map<string, ScoreWithChartRow>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabaseClient = getSupabaseBrowserClient()

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb || symbolsGrouped.length === 0) {
      queueMicrotask(() => {
        setRowsBySymbol(new Map())
        setLoading(false)
        setError(null)
      })
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })

    void sb
      .from('screen_scores')
      .select('symbol, display_name, screen_charts!inner(payload, fetch_error, updated_at)')
      .in('symbol', symbolsGrouped)
      .then(({ data, error: qErr }) => {
        if (cancelled) return
        setLoading(false)
        if (qErr) {
          setError(qErr.message)
          setRowsBySymbol(new Map())
          return
        }
        const map = new Map<string, ScoreWithChartRow>()
        for (const row of (data as ScoreWithChartRow[]) ?? []) {
          map.set(row.symbol.trim().toUpperCase(), row)
        }
        setRowsBySymbol(map)
      })

    return () => {
      cancelled = true
    }
  }, [symbolsGrouped.join('|')])

  const panels = useMemo(() => {
    return symbolsGrouped.map((symbol) => {
      const row = rowsBySymbol.get(symbol)
      const timeframes = timeframesFor(symbol)
      const showWeekly = timeframes.includes('weekly')
      const showDaily = timeframes.includes('daily')
      if (!row) {
        return {
          symbol,
          displayName: null as string | null,
          data: null,
          err: loading ? null : 'Chart data not loaded yet.',
          showWeekly,
          showDaily,
        }
      }
      const parsed = parseChartPanel(row)
      return { ...parsed, showWeekly, showDaily }
    })
  }, [symbolsGrouped, rowsBySymbol, timeframesFor, loading])

  return (
    <div className="min-h-dvh text-moat-ink">
      <h1 className="sr-only">Bookmarked charts</h1>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5">
          <h2 className="font-display text-2xl text-moat-ink">Bookmarks</h2>
          <p className="mt-1 text-sm text-slate-600">
            Saved weekly and daily charts from the{' '}
            <Link to="/charts" className="font-medium text-moat-accent-dim hover:underline">
              Charts
            </Link>{' '}
            gallery. Bookmarks stay in this browser.
          </p>
        </div>

        {count === 0 ? (
          <div className="chart-gallery-empty">
            <p className="chart-gallery-empty__title">No bookmarks yet</p>
            <p className="chart-gallery-empty__copy">
              Open the{' '}
              <Link to="/charts" className="chart-gallery-empty__link">
                Charts page
              </Link>{' '}
              and tap the bookmark icon on any weekly or daily chart to save it here.
            </p>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Loading bookmarked charts…</p> : null}
        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</div>
        ) : null}

        {count > 0 && !loading && !error ? (
          <div className="space-y-6">
            {panels.map(({ symbol, displayName, data, err, showWeekly, showDaily }) => (
              <ChartGalleryTickerBlock
                key={symbol}
                symbol={symbol}
                displayName={displayName}
                data={data}
                error={err}
                showWeekly={showWeekly}
                showDaily={showDaily}
              />
            ))}
          </div>
        ) : null}

        {!supabaseClient && count > 0 ? (
          <p className="mt-4 text-sm text-amber-900">
            Supabase is not configured — chart data cannot be loaded in the browser.
          </p>
        ) : null}
      </main>
    </div>
  )
}
