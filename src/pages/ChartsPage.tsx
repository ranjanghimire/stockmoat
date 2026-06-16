import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChartGalleryTickerBlock } from '../components/ChartGalleryTickerBlock'
import { ChartsSortBar } from '../components/ChartsSortBar'
import { ScreenerFilters } from '../components/ScreenerFilters'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { applyScreenerFilters } from '../lib/screen/applyScreenerFilters'
import {
  chartsDbOrderColumn,
  chartsSortNullGuardColumn,
  DEFAULT_CHARTS_SORT,
  type ChartsSortState,
} from '../lib/screen/chartsSortTypes'
import {
  EMPTY_SCREENER_FILTERS,
  screenerFiltersActive,
  type ScreenerFilters as ScreenerFiltersState,
} from '../lib/screen/screenerFilterTypes'
import { parseChartPanel, type ScoreWithChartRow } from '../lib/screenCharts'
import { getSupabaseBrowserClient, type ScreenScoreRow } from '../lib/supabaseClient'

const PAGE_SIZE = 50
const PAGINATION_SIBLINGS = 1
const GALLERY_TABLE = 'screen_screener_list'

type PaginationItem = number | 'ellipsis'

type FacetRow = Pick<ScreenScoreRow, 'profile_id' | 'sector'>

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

function isDefaultSort(sort: ChartsSortState): boolean {
  return sort.column === DEFAULT_CHARTS_SORT.column && sort.ascending === DEFAULT_CHARTS_SORT.ascending
}

export default function ChartsPage() {
  const [facetRows, setFacetRows] = useState<FacetRow[] | null>(null)
  const [rows, setRows] = useState<ScoreWithChartRow[] | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ScreenerFiltersState>(EMPTY_SCREENER_FILTERS)
  const debouncedFilters = useDebouncedValue(filters, 300)
  const [sort, setSort] = useState<ChartsSortState>(DEFAULT_CHARTS_SORT)

  const supabaseClient = getSupabaseBrowserClient()

  const patchFilters = useCallback((patch: Partial<ScreenerFiltersState>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_SCREENER_FILTERS)
    setPage(1)
  }, [])

  const handleSortChange = useCallback((next: ChartsSortState) => {
    setSort(next)
    setPage(1)
  }, [])

  useEffect(() => {
    if (supabaseClient) return
    const id = window.setTimeout(() => {
      setLoading(false)
      setError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, apply migrations, and run the nightly chart job.',
      )
      setRows(null)
      setFacetRows(null)
      setTotalCount(0)
    }, 0)
    return () => window.clearTimeout(id)
  }, [supabaseClient])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) return
    let cancelled = false
    void sb
      .from('screen_scores')
      .select('profile_id, sector')
      .then(({ data, error: facetErr }) => {
        if (cancelled) return
        if (facetErr) {
          console.warn('Charts facets load failed:', facetErr.message)
          setFacetRows([])
          return
        }
        setFacetRows((data as FacetRow[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [])

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
      const orderCol = chartsDbOrderColumn(sort.column)
      const nullGuard = chartsSortNullGuardColumn(sort.column)

      // Supabase PostgrestFilterBuilder generics recurse too deeply for chained filters.
      let q: any = sb
        .from(GALLERY_TABLE)
        .select('symbol, display_name, screen_charts!inner(payload, fetch_error, updated_at)', { count: 'exact' })
        .order(orderCol, { ascending: sort.ascending, nullsFirst: false })

      if (nullGuard) q = q.not(nullGuard, 'is', null)
      q = applyScreenerFilters(q, debouncedFilters)

      void q
        .range(from, to)
        .then(({ data, error: qErr, count }: { data: unknown; error: { message: string; code?: string } | null; count: number | null }) => {
          if (cancelled) return
          setLoading(false)
          if (qErr) {
            const hint =
              qErr.message.includes('screen_screener_list') ||
              qErr.message.includes('screen_charts') ||
              qErr.code === 'PGRST205'
                ? ' Apply the screener view migration (`npx supabase db push`).'
                : ''
            setError(qErr.message + hint)
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
  }, [page, debouncedFilters, sort.column, sort.ascending])

  const profileOptions = useMemo(() => {
    if (!facetRows?.length) return []
    const ids = [...new Set(facetRows.map((r) => r.profile_id))].filter(Boolean)
    return ids.sort((a, b) => a.localeCompare(b))
  }, [facetRows])

  const { sectorList, hasEmptySector } = useMemo(() => {
    if (!facetRows?.length) return { sectorList: [] as string[], hasEmptySector: false }
    const set = new Set<string>()
    let hasEmpty = false
    for (const r of facetRows) {
      const s = r.sector?.trim()
      if (s) set.add(s)
      else hasEmpty = true
    }
    return { sectorList: [...set].sort((a, b) => a.localeCompare(b)), hasEmptySector: hasEmpty }
  }, [facetRows])

  useEffect(() => {
    if (!facetRows) return
    const id = window.setTimeout(() => {
      if (filters.profile && !profileOptions.includes(filters.profile)) {
        patchFilters({ profile: '' })
      }
      if (filters.sector === '__none__' && !hasEmptySector) {
        patchFilters({ sector: '' })
      } else if (filters.sector && filters.sector !== '__none__' && !sectorList.includes(filters.sector)) {
        patchFilters({ sector: '' })
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [facetRows, filters.profile, filters.sector, profileOptions, sectorList, hasEmptySector, patchFilters])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rowStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rowEnd = Math.min(page * PAGE_SIZE, totalCount)
  const paginationItems = useMemo(() => getPaginationItems(page, totalPages), [page, totalPages])
  const filtersActive = screenerFiltersActive(filters)

  const panels = useMemo(() => {
    if (!rows?.length) return []
    return rows.map((row) => parseChartPanel(row))
  }, [rows])

  return (
    <div className="min-h-dvh text-moat-ink">
      <header className="border-b border-slate-200/80 bg-white/70 px-4 py-6 backdrop-blur-md">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moat-accent-dim">StockMoat</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl">Charts</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Precomputed weekly and daily OHLC from the nightly chart job. Use the same optional filters as the screener;
            only tickers with stored chart payloads appear. Sort by moat score, forward growth rank, or next earnings
            date.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {loading ? <p className="text-sm text-slate-500">Loading charts…</p> : null}
        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</div>
        ) : null}

        {supabaseClient && !error ? (
          <>
            <ScreenerFilters
              filters={filters}
              onChange={patchFilters}
              onClear={clearFilters}
              profileOptions={profileOptions}
              sectorList={sectorList}
              hasEmptySector={hasEmptySector}
            />
            <ChartsSortBar sort={sort} onChange={handleSortChange} />
          </>
        ) : null}

        {!loading &&
        !error &&
        supabaseClient &&
        totalCount === 0 &&
        !filtersActive &&
        isDefaultSort(sort) ? (
          <p className="text-sm text-slate-600">
            No chart rows linked to scores yet. Run the nightly workflow after{' '}
            <span className="font-mono">screen_charts</span> is populated.
          </p>
        ) : null}

        {!loading &&
        !error &&
        supabaseClient &&
        totalCount === 0 &&
        !filtersActive &&
        !isDefaultSort(sort) &&
        sort.column === 'forward_growth_score' ? (
          <p className="text-sm text-slate-600">
            No forward growth scores yet. Rerun the nightly screen workflow so{' '}
            <span className="font-mono">forward_growth_score</span> is populated.
          </p>
        ) : null}

        {!loading &&
        !error &&
        supabaseClient &&
        totalCount === 0 &&
        !filtersActive &&
        !isDefaultSort(sort) &&
        sort.column === 'next_earnings_date' ? (
          <p className="text-sm text-slate-600">
            No earnings dates yet. Rerun the nightly earnings workflow so{' '}
            <span className="font-mono">next_earnings_date</span> is populated.
          </p>
        ) : null}

        {!loading && !error && supabaseClient && totalCount === 0 && filtersActive ? (
          <p className="text-sm text-slate-600">No charts match the selected filters.</p>
        ) : null}

        {!loading &&
        !error &&
        supabaseClient &&
        totalCount === 0 &&
        !filtersActive &&
        !isDefaultSort(sort) &&
        sort.column === 'score' ? (
          <p className="text-sm text-slate-600">
            No chart rows linked to scores yet. Run the nightly workflow after{' '}
            <span className="font-mono">screen_charts</span> is populated.
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
