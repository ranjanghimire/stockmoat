import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) {
      const id = window.setTimeout(() => {
        setLoading(false)
        setError(
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, apply the SQL in supabase/screen_scores.sql, then run npm run screen:nightly with your FMP and service-role keys.',
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

  return (
    <div className="min-h-dvh text-moat-ink">
      <header className="border-b border-slate-200/80 bg-white/70 px-4 py-8 backdrop-blur-md">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moat-accent-dim">StockMoat</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl">Nightly screener</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Scores are written by the batch job (<span className="font-mono">npm run screen:nightly</span>) using the same FMP
            pipeline as the analyzer. Data can be about a day behind FMP depending on when you last ran the job.
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
                {rows.map((r, i) => (
                  <tr key={r.symbol} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-moat-ink">{r.score.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-mono font-medium">{r.symbol}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  )
}
