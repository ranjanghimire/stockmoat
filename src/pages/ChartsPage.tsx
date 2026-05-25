import { useEffect, useMemo, useState } from 'react'
import { ChartGalleryTickerBlock } from '../components/ChartGalleryTickerBlock'
import { parseChartPanel, type ScoreWithChartRow } from '../lib/screenCharts'
import { getSupabaseBrowserClient } from '../lib/supabaseClient'

const PAGE_SIZE = 50
const PAGINATION_SIBLINGS = 1

type PaginationItem = number | 'ellipsis'

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const visiblePages = PAGINATION_SIBLINGS * 2 + 5
  if (totalPages <= visiblePages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(currentPage - PAGINATION_SIBLINGS, 2)
  const rightSibling = Math.min(currentPage + PAGINATION_SIBLINGS, totalPages - 1)
  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < totalPages - 1

  if (!showLeftEllipsis && showRightEllipsis) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, 'ellipsis', leftSibling, currentPage, rightSibling, 'ellipsis', totalPages]
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
        .select('symbol, display_name, screen_charts!inner(payload, fetch_error, updated_at)', { count: 'exact' })
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
  const paginationItems = useMemo(() => getPaginationItems(page, totalPages), [page, totalPages])

  const panels = useMemo(() => {
    if (!rows?.length) return []
    return rows.map((row) => parseChartPanel(row))
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
                  <div className="flex flex-wrap items-center gap-1" aria-label="Pagination">
                    {paginationItems.map((item, index) =>
                      item === 'ellipsis' ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="px-2 py-1.5 text-sm font-semibold text-slate-400"
                          aria-hidden="true"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          aria-current={item === page ? 'page' : undefined}
                          onClick={() => setPage(item)}
                          className={
                            item === page
                              ? 'rounded-xl border border-moat-ink bg-moat-ink px-3 py-1.5 text-sm font-semibold text-white shadow-sm'
                              : 'rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50'
                          }
                        >
                          {item}
                        </button>
                      ),
                    )}
                  </div>
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
              {panels.map(({ symbol, displayName, data, err }) => (
                <ChartGalleryTickerBlock
                  key={symbol}
                  symbol={symbol}
                  displayName={displayName}
                  data={data}
                  error={err}
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
