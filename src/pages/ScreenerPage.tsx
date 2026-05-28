import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PriceChartsPanel } from '../components/PriceChartsPanel'
import { ScreenerSortableHeader, type ScreenerSortableColumn } from '../components/ScreenerSortableHeader'
import { formatNextEarningsDisplay } from '../lib/fmp/fetchFmpNextEarningsDate'
import { fetchForwardGrowthCagrUniverse, percentileForwardGrowthScores } from '../lib/fmp/forwardRevenueGrowthScore'
import {
  getSupabaseBrowserClient,
  type ScreenChartRow,
  type ScreenScoreRow,
  type ScreenScreenerRow,
} from '../lib/supabaseClient'
import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'
import './screenerPage.css'

const PAGE_SIZE = 25

const SCREENER_TABLE = 'screen_screener_list'

const LIST_COLUMNS =
  'symbol, display_name, score, forward_rev_cagr_3y, forward_growth_score, profile_id, sector, industry, any_gate_fail, score_cap, raw_weighted, updated_at, next_earnings_date'

function cycleSort(
  active: ScreenerSortableColumn | null,
  ascending: boolean,
  clicked: ScreenerSortableColumn,
): { column: ScreenerSortableColumn | null; ascending: boolean } {
  if (active !== clicked) return { column: clicked, ascending: false }
  if (!ascending) return { column: clicked, ascending: true }
  return { column: null, ascending: false }
}

function dbOrderColumn(column: ScreenerSortableColumn | null): string {
  if (!column) return 'symbol'
  if (column === 'forward_growth_score') return 'forward_rev_cagr_3y'
  return column
}

function formatProfileId(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function isPriceChartsPayload(v: unknown): v is PriceChartsPayload {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.symbol === 'string' && Array.isArray(o.weekly) && Array.isArray(o.daily)
}

type ChartModalState = { symbol: string; displayName: string }

type FacetRow = Pick<ScreenScoreRow, 'profile_id' | 'sector'>

export default function ScreenerPage() {
  const [facetRows, setFacetRows] = useState<FacetRow[] | null>(null)
  const [rows, setRows] = useState<ScreenScreenerRow[] | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterProfile, setFilterProfile] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [sortColumn, setSortColumn] = useState<ScreenerSortableColumn | null>(null)
  const [sortAscending, setSortAscending] = useState(false)

  const [forwardGrowthRank, setForwardGrowthRank] = useState<Map<string, number> | null>(null)

  const [chartModal, setChartModal] = useState<ChartModalState | null>(null)
  const [chartData, setChartData] = useState<PriceChartsPayload | null>(null)
  const [chartRowMeta, setChartRowMeta] = useState<{ updated_at: string | null; fetch_error: string | null } | null>(
    null,
  )
  const [chartLoadState, setChartLoadState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [chartQueryError, setChartQueryError] = useState<string | null>(null)
  const chartRequestId = useRef(0)

  const closeChart = useCallback(() => {
    chartRequestId.current += 1
    setChartModal(null)
    setChartData(null)
    setChartRowMeta(null)
    setChartLoadState('idle')
    setChartQueryError(null)
  }, [])

  const openChart = useCallback(async (symbol: string, displayName: string) => {
    const sym = symbol.trim().toUpperCase()
    const reqId = ++chartRequestId.current
    setChartModal({ symbol: sym, displayName })
    setChartLoadState('loading')
    setChartData(null)
    setChartRowMeta(null)
    setChartQueryError(null)

    const sb = getSupabaseBrowserClient()
    if (!sb) {
      if (reqId !== chartRequestId.current) return
      setChartQueryError('Supabase is not configured in this build.')
      setChartLoadState('done')
      return
    }

    const { data, error: qErr } = await sb
      .from('screen_charts')
      .select('payload, fetch_error, updated_at')
      .eq('symbol', sym)
      .maybeSingle()

    if (reqId !== chartRequestId.current) return

    if (qErr) {
      setChartQueryError(qErr.message)
      setChartLoadState('done')
      return
    }

    if (!data) {
      setChartQueryError(
        'No chart row for this symbol yet. Apply the screen_charts migration (`npx supabase db push`) and run the nightly workflow so charts are populated.',
      )
      setChartLoadState('done')
      return
    }

    const row = data as Pick<ScreenChartRow, 'payload' | 'fetch_error' | 'updated_at'>
    setChartRowMeta({ updated_at: row.updated_at ?? null, fetch_error: row.fetch_error ?? null })

    if (row.fetch_error) {
      setChartData(null)
      setChartLoadState('done')
      return
    }

    if (!row.payload || !isPriceChartsPayload(row.payload)) {
      setChartQueryError('Chart payload is missing or invalid for this symbol.')
      setChartLoadState('done')
      return
    }

    setChartData(row.payload)
    setChartLoadState('done')
  }, [])

  useEffect(() => {
    if (!chartModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chartModal, closeChart])

  useEffect(() => {
    if (!chartModal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [chartModal])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (sb) return
    const id = window.setTimeout(() => {
      setLoading(false)
      setError(
        'Supabase is not configured for the browser build. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY on Vercel), redeploy, then apply schema with `npx supabase db push` (including screen_charts) and run the nightly job with the service role key.',
      )
      setRows(null)
      setFacetRows(null)
      setTotalCount(0)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

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
          console.warn('Screener facets load failed:', facetErr.message)
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
    if (sortColumn !== 'forward_growth_score') {
      queueMicrotask(() => setForwardGrowthRank(null))
      return
    }

    let cancelled = false
    void fetchForwardGrowthCagrUniverse(sb)
      .then((universe) => {
        if (cancelled) return
        setForwardGrowthRank(percentileForwardGrowthScores(universe))
      })
      .catch(() => {
        if (cancelled) return
        setForwardGrowthRank(new Map())
      })

    return () => {
      cancelled = true
    }
  }, [sortColumn])

  const handleHeaderSort = useCallback((clicked: ScreenerSortableColumn) => {
    const next = cycleSort(sortColumn, sortAscending, clicked)
    setSortColumn(next.column)
    setSortAscending(next.ascending)
    setPage(1)
  }, [sortColumn, sortAscending])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)

      const orderCol = dbOrderColumn(sortColumn)
      const ascending = sortColumn ? sortAscending : true

      let q = sb
        .from(SCREENER_TABLE)
        .select(LIST_COLUMNS, { count: 'exact' })
        .order(orderCol, { ascending, nullsFirst: false })

      if (sortColumn === 'forward_growth_score') q = q.not('forward_rev_cagr_3y', 'is', null)
      if (filterProfile) q = q.eq('profile_id', filterProfile)
      if (filterSector === '__none__') q = q.or('sector.is.null,sector.eq.')
      else if (filterSector) q = q.eq('sector', filterSector)

      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      void q.range(from, to).then(({ data, error: qErr, count }) => {
        if (cancelled) return
        setLoading(false)
        if (qErr) {
          const hint =
            qErr.message.includes('screen_screener_list') || qErr.code === 'PGRST205'
              ? ' Apply the screener view migration (`npx supabase db push`).'
              : ''
          setError(qErr.message + hint)
          setRows(null)
          setTotalCount(0)
          return
        }
        const c = count ?? 0
        setTotalCount(c)
        setRows((data as ScreenScreenerRow[]) ?? [])
        const maxPage = Math.max(1, Math.ceil(c / PAGE_SIZE))
        setPage((p) => (p > maxPage ? maxPage : p))
      })
    })

    return () => {
      cancelled = true
    }
  }, [page, filterProfile, filterSector, sortColumn, sortAscending])

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
      if (filterProfile && !profileOptions.includes(filterProfile)) {
        setFilterProfile('')
        setPage(1)
      }
      if (filterSector === '__none__' && !hasEmptySector) {
        setFilterSector('')
        setPage(1)
      } else if (filterSector && filterSector !== '__none__' && !sectorList.includes(filterSector)) {
        setFilterSector('')
        setPage(1)
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [facetRows, filterProfile, filterSector, profileOptions, sectorList, hasEmptySector])

  const selectClass =
    'w-full min-w-[10rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-moat-ink shadow-inner outline-none focus:ring-2 focus:ring-moat-accent/30 md:max-w-xs'

  const chartsPanelError =
    chartLoadState === 'done' ? chartQueryError ?? chartRowMeta?.fetch_error ?? null : null

  const chartContextNote =
    'Stored by the nightly job from FMP dividend-adjusted EOD (weekly ~2y, daily ~6mo). For shape context only — not a live feed.'

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rowStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rowEnd = Math.min(page * PAGE_SIZE, totalCount)

  const supabaseClient = getSupabaseBrowserClient()

  return (
    <div className="min-h-dvh text-moat-ink">
      <header className="border-b border-slate-200/80 bg-white/70 px-4 py-8 backdrop-blur-md">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moat-accent-dim">StockMoat</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl">Nightly screener</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Moat and forward growth (1–10, consensus revenue CAGR over the next three estimate years) are written by
            the nightly batch job. Data can be about a day behind the LIVE market. Click a column header to sort
            (descending, ascending, then reset). Use <span className="font-medium">Chart</span> for precomputed OHLC
            windows. The table loads <span className="font-mono">{PAGE_SIZE}</span> rows per page.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {loading ? <p className="text-sm text-slate-500">Loading scores…</p> : null}
        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</div>
        ) : null}

        {!loading &&
        !error &&
        supabaseClient &&
        totalCount === 0 &&
        !filterProfile &&
        !filterSector &&
        sortColumn !== 'forward_growth_score' ? (
          <p className="text-sm text-slate-600">
            No rows in <span className="font-mono">screen_scores</span> yet. Run the nightly script after creating the table.
          </p>
        ) : null}

        {!loading &&
        !error &&
        supabaseClient &&
        totalCount === 0 &&
        !filterProfile &&
        !filterSector &&
        sortColumn === 'forward_growth_score' ? (
          <p className="text-sm text-slate-600">
            No forward growth data yet. Rerun the nightly workflow so <span className="font-mono">forward_rev_cagr_3y</span> is populated.
          </p>
        ) : null}

        {!loading && !error && supabaseClient && totalCount === 0 && (filterProfile || filterSector) ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-[14rem]">
                <label htmlFor="screener-profile" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Profile
                </label>
                <select
                  id="screener-profile"
                  value={filterProfile}
                  onChange={(e) => {
                    setFilterProfile(e.target.value)
                    setPage(1)
                  }}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">All profiles</option>
                  {profileOptions.map((id) => (
                    <option key={id} value={id}>
                      {formatProfileId(id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1 sm:max-w-[14rem]">
                <label htmlFor="screener-sector" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sector
                </label>
                <select
                  id="screener-sector"
                  value={filterSector}
                  onChange={(e) => {
                    setFilterSector(e.target.value)
                    setPage(1)
                  }}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">All sectors</option>
                  {sectorList.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {hasEmptySector ? (
                    <option value="__none__">No sector</option>
                  ) : null}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterProfile('')
                  setFilterSector('')
                  setPage(1)
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
            <p className="text-sm text-slate-600">No rows match the selected filters.</p>
          </div>
        ) : null}

        {!loading && !error && supabaseClient && totalCount > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-[14rem]">
                <label htmlFor="screener-profile" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Profile
                </label>
                <select
                  id="screener-profile"
                  value={filterProfile}
                  onChange={(e) => {
                    setFilterProfile(e.target.value)
                    setPage(1)
                  }}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">All profiles</option>
                  {profileOptions.map((id) => (
                    <option key={id} value={id}>
                      {formatProfileId(id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1 sm:max-w-[14rem]">
                <label htmlFor="screener-sector" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sector
                </label>
                <select
                  id="screener-sector"
                  value={filterSector}
                  onChange={(e) => {
                    setFilterSector(e.target.value)
                    setPage(1)
                  }}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">All sectors</option>
                  {sectorList.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {hasEmptySector ? (
                    <option value="__none__">No sector</option>
                  ) : null}
                </select>
              </div>
              {(filterProfile || filterSector) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterProfile('')
                    setFilterSector('')
                    setPage(1)
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p>
                Rows <span className="font-mono font-medium text-moat-ink">{rowStart}</span>
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
            <div className="screener-table-wrap">
              <table className="screener-table">
                <thead>
                  <tr>
                    <th className="screener-table__th screener-table__th--num">#</th>
                    <ScreenerSortableHeader
                      label="Moat"
                      column="score"
                      activeColumn={sortColumn}
                      ascending={sortAscending}
                      onSort={handleHeaderSort}
                    />
                    <ScreenerSortableHeader
                      label="Fwd growth"
                      column="forward_growth_score"
                      activeColumn={sortColumn}
                      ascending={sortAscending}
                      onSort={handleHeaderSort}
                    />
                    <ScreenerSortableHeader
                      label="Ticker"
                      column="symbol"
                      activeColumn={sortColumn}
                      ascending={sortAscending}
                      onSort={handleHeaderSort}
                    />
                    <ScreenerSortableHeader
                      label="Name"
                      column="display_name"
                      activeColumn={sortColumn}
                      ascending={sortAscending}
                      onSort={handleHeaderSort}
                    />
                    <ScreenerSortableHeader
                      label="Earnings date"
                      column="next_earnings_date"
                      activeColumn={sortColumn}
                      ascending={sortAscending}
                      onSort={handleHeaderSort}
                    />
                    <th className="screener-table__th">Chart</th>
                    <th className="screener-table__th">Profile</th>
                    <th className="screener-table__th">Sector</th>
                    <th className="screener-table__th">Gate</th>
                    <ScreenerSortableHeader
                      label="Updated"
                      column="updated_at"
                      activeColumn={sortColumn}
                      ascending={sortAscending}
                      onSort={handleHeaderSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {!rows || rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="screener-table__td px-4 py-10 text-center text-sm text-slate-500">
                        No rows on this page.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const sym = r.symbol.trim().toUpperCase()
                      const fwdDisplay =
                        sortColumn === 'forward_growth_score'
                          ? (forwardGrowthRank?.get(sym) ?? '—')
                          : r.forward_growth_score != null
                            ? r.forward_growth_score
                            : '—'
                      const earningsLabel = r.next_earnings_date
                        ? formatNextEarningsDisplay(r.next_earnings_date)
                        : '—'

                      return (
                        <tr key={r.symbol}>
                          <td className="screener-table__td screener-table__td--num">{(page - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="screener-table__td screener-table__td--moat">{r.score.toFixed(2)}</td>
                          <td className="screener-table__td screener-table__td--growth">{fwdDisplay}</td>
                          <td className="screener-table__td font-mono font-medium">
                            <Link
                              to={`/?ticker=${encodeURIComponent(r.symbol)}`}
                              className="text-moat-accent underline decoration-moat-accent/30 underline-offset-2 transition hover:text-moat-accent-dim hover:decoration-moat-accent-dim"
                            >
                              {r.symbol}
                            </Link>
                          </td>
                          <td className="screener-table__td text-slate-800">{r.display_name}</td>
                          <td className="screener-table__td screener-table__td--earnings">{earningsLabel}</td>
                          <td className="screener-table__td whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => void openChart(r.symbol, r.display_name)}
                              className="text-moat-accent underline decoration-moat-accent/30 underline-offset-2 transition hover:text-moat-accent-dim hover:decoration-moat-accent-dim"
                            >
                              Chart
                            </button>
                          </td>
                          <td className="screener-table__td max-w-[200px] truncate text-slate-600" title={r.profile_id}>
                            {formatProfileId(r.profile_id)}
                          </td>
                          <td className="screener-table__td max-w-[160px] truncate text-slate-500" title={r.sector ?? ''}>
                            {r.sector ?? '—'}
                          </td>
                          <td className="screener-table__td">
                            {r.any_gate_fail ? (
                              <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-800">Fail</span>
                            ) : (
                              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">OK</span>
                            )}
                          </td>
                          <td className="screener-table__td screener-table__td--updated">
                            {new Date(r.updated_at).toLocaleString()}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </main>

      {chartModal ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={closeChart}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="screener-chart-title"
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md md:px-5">
              <div className="min-w-0">
                <h2 id="screener-chart-title" className="font-display text-lg text-moat-ink md:text-xl">
                  Chart · <span className="font-mono">{chartModal.symbol}</span>
                </h2>
                <p className="mt-0.5 truncate text-sm text-slate-600" title={chartModal.displayName}>
                  {chartModal.displayName}
                </p>
                {chartRowMeta?.updated_at ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Snapshot from nightly job:{' '}
                    <span className="font-mono">{new Date(chartRowMeta.updated_at).toLocaleString()}</span>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeChart}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="p-4 md:p-5">
              <PriceChartsPanel
                ticker={chartModal.symbol}
                data={chartData}
                loading={chartLoadState === 'loading'}
                error={chartsPanelError}
                contextNote={chartContextNote}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
