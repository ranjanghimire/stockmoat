import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabaseBrowserClient, type ScreenScoreRow } from '../lib/supabaseClient'

function formatProfileId(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function ScreenerPage() {
  const [rows, setRows] = useState<ScreenScoreRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterProfile, setFilterProfile] = useState('')
  const [filterSector, setFilterSector] = useState('')

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) {
      const id = window.setTimeout(() => {
        setLoading(false)
        setError(
          'Supabase is not configured for the browser build. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY on Vercel), redeploy, then apply schema with `npx supabase db push` and run the nightly job with the service role key.',
        )
        setRows(null)
      }, 0)
      return () => window.clearTimeout(id)
    }

    let cancelled = false
    const startId = window.setTimeout(() => {
      if (cancelled) return
      setError(null)
      void sb
        .from('screen_scores')
        .select(
          'symbol, display_name, score, profile_id, sector, industry, any_gate_fail, score_cap, raw_weighted, updated_at',
        )
        .order('score', { ascending: false })
        .then(({ data, error: qErr }) => {
          if (cancelled) return
          setLoading(false)
          if (qErr) {
            setError(qErr.message)
            setRows(null)
            return
          }
          setRows((data as ScreenScoreRow[]) ?? [])
        })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(startId)
    }
  }, [])

  const profileOptions = useMemo(() => {
    if (!rows?.length) return []
    const ids = [...new Set(rows.map((r) => r.profile_id))].filter(Boolean)
    return ids.sort((a, b) => a.localeCompare(b))
  }, [rows])

  const { sectorList, hasEmptySector } = useMemo(() => {
    if (!rows?.length) return { sectorList: [] as string[], hasEmptySector: false }
    const set = new Set<string>()
    let hasEmpty = false
    for (const r of rows) {
      const s = r.sector?.trim()
      if (s) set.add(s)
      else hasEmpty = true
    }
    return { sectorList: [...set].sort((a, b) => a.localeCompare(b)), hasEmptySector: hasEmpty }
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      if (filterProfile && r.profile_id !== filterProfile) return false
      if (filterSector === '__none__') return !r.sector?.trim()
      if (filterSector) return (r.sector ?? '').trim() === filterSector
      return true
    })
  }, [rows, filterProfile, filterSector])

  useEffect(() => {
    if (!rows?.length) return
    const id = window.setTimeout(() => {
      if (filterProfile && !profileOptions.includes(filterProfile)) {
        setFilterProfile('')
      }
      if (filterSector === '__none__' && !hasEmptySector) {
        setFilterSector('')
      } else if (filterSector && filterSector !== '__none__' && !sectorList.includes(filterSector)) {
        setFilterSector('')
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [rows, filterProfile, filterSector, profileOptions, sectorList, hasEmptySector])

  const selectClass =
    'w-full min-w-[10rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-moat-ink shadow-inner outline-none focus:ring-2 focus:ring-moat-accent/30 md:max-w-xs'

  return (
    <div className="min-h-dvh text-moat-ink">
      <header className="border-b border-slate-200/80 bg-white/70 px-4 py-8 backdrop-blur-md">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moat-accent-dim">StockMoat</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl">Nightly screener</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Scores are written by the nightly batch job. Data can be about a day behind the LIVE market. 
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {loading ? <p className="text-sm text-slate-500">Loading scores…</p> : null}
        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</div>
        ) : null}

        {!loading && !error && rows && rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No rows in <span className="font-mono">screen_scores</span> yet. Run the nightly script after creating the table.
          </p>
        ) : null}

        {!loading && rows && rows.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-[14rem]">
                <label htmlFor="screener-profile" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Profile
                </label>
                <select
                  id="screener-profile"
                  value={filterProfile}
                  onChange={(e) => setFilterProfile(e.target.value)}
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
                  onChange={(e) => setFilterSector(e.target.value)}
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
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Clear filters
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Showing <span className="font-mono font-medium text-moat-ink">{filteredRows.length}</span> of{' '}
              <span className="font-mono">{rows.length}</span> rows
              {filteredRows.length === 0 ? ' — adjust filters to see results.' : null}
            </p>
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm backdrop-blur">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Score</th>
                  <th className="px-3 py-3">Ticker</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Profile</th>
                  <th className="px-3 py-3">Sector</th>
                  <th className="px-3 py-3">Gate</th>
                  <th className="px-3 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No rows match the selected filters. Try different profile or sector, or clear filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, i) => (
                    <tr key={r.symbol} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-moat-ink">{r.score.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono font-medium">
                        <Link
                          to={`/?ticker=${encodeURIComponent(r.symbol)}`}
                          className="text-moat-accent underline decoration-moat-accent/30 underline-offset-2 transition hover:text-moat-accent-dim hover:decoration-moat-accent-dim"
                        >
                          {r.symbol}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-800">{r.display_name}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-600" title={r.profile_id}>
                        {formatProfileId(r.profile_id)}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-500" title={r.sector ?? ''}>
                        {r.sector ?? '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.any_gate_fail ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-800">Fail</span>
                        ) : (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">OK</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                        {new Date(r.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
