import { useEffect, useMemo, useState } from 'react'
import { PriceChartsPanel } from '../components/PriceChartsPanel'
import { getSupabaseBrowserClient } from '../lib/supabaseClient'
import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'

const PAGE_SIZE = 50

function isPriceChartsPayload(v: unknown): v is PriceChartsPayload {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.symbol === 'string' && Array.isArray(o.weekly) && Array.isArray(o.daily)
}

type ChartEmbed = {
  payload: unknown
  fetch_error: string | null
  updated_at?: string
}

type ScoreWithChartRow = {
  symbol: string
  screen_charts: ChartEmbed | ChartEmbed[] | null
}

function pickEmbeddedChart(row: ScoreWithChartRow): ChartEmbed | null {
  const c = row.screen_charts
  if (!c) return null
  if (Array.isArray(c)) return c[0] ?? null
  return c
}

export default function ChartsPage() {
  const [rows, setRows] = useState<ScoreWithChartRow[] | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabaseClient = getSupabaseBrowserClient()

  useEffect(() => {
    if (supabaseClient) return
    const id = window.setTimeout(() => {
      setLoading(false)
      setError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, apply migrations, and run the nightly chart job.',
      )
      setRows(null)
      setTotalCount(0)
    }, 0)
    return () => window.clearTimeout(id)
  }, [supabaseClient])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)

      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      void sb
        .from('screen_scores')
        .select('symbol, screen_charts!inner(payload, fetch_error, updated_at)', { count: 'exact' })
        .order('score', { ascending: false })
        .range(from, to)
        .then(({ data, error: qErr, count }) => {
          if (cancelled) return
          setLoading(false)
          if (qErr) {
            setError(qErr.message)
            setRows(null)
            setTotalCount(0)
            return
          }
          setTotalCount(count ?? 0)
          setRows((data as ScoreWithChartRow[]) ?? [])
          const maxPage = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
          setPage((p) => (p > maxPage ? maxPage : p))
        })
    })

    return () => {
      cancelled = true
    }
  }, [page])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rowStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rowEnd = Math.min(page * PAGE_SIZE, totalCount)

  const panels = useMemo(() => {
    if (!rows?.length) return []
    return rows.map((row) => {
      const sym = row.symbol
      const embed = pickEmbeddedChart(row)
      if (!embed) {
        return { symbol: sym, data: null as PriceChartsPayload | null, err: 'Missing chart row.' as string | null }
      }
      if (embed.fetch_error) {
        return { symbol: sym, data: null, err: embed.fetch_error }
      }
      if (!embed.payload || !isPriceChartsPayload(embed.payload)) {
        return { symbol: sym, data: null, err: 'Invalid or empty chart payload.' }
      }
      return { symbol: sym, data: embed.payload, err: null as string | null }
    })
  }, [rows])

  return (
    <div className="min-h-dvh text-moat-ink">
      <h1 className="sr-only">Precomputed nightly charts</h1>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading ? <p className="text-sm text-slate-500">Loading charts…</p> : null}
        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</div>
        ) : null}

        {!loading && !error && supabaseClient && totalCount === 0 ? (
          <p className="text-sm text-slate-600">
            No chart rows linked to scores yet. Run the nightly workflow after <span className="font-mono">screen_charts</span>{' '}
            is populated.
          </p>
        ) : null}

        {!loading && !error && supabaseClient && totalCount > 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p>
                Tickers <span className="font-mono font-medium text-moat-ink">{rowStart}</span>
                {'–'}
                <span className="font-mono font-medium text-moat-ink">{rowEnd}</span> of{' '}
                <span className="font-mono">{totalCount}</span>
                {totalPages > 1 ? (
                  <>
                    {' '}
                    · page <span className="font-mono">{page}</span> of <span className="font-mono">{totalPages}</span>
                  </>
                ) : null}
              </p>
              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-6">
              {panels.map(({ symbol, data, err }) => (
                <PriceChartsPanel
                  key={symbol}
                  ticker={symbol}
                  data={data}
                  loading={false}
                  error={err}
                  chartsOnly
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
