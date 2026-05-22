import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NewsSubscribeButton } from '../components/NewsSubscribeButton'
import { loadNewsAnchors } from '../lib/news/loadNewsAnchors'
import { getSupabaseBrowserClient, type MaterialNewsRow } from '../lib/supabaseClient'

const CATEGORY_LABELS: Record<string, string> = {
  govt_policy: 'Policy / regulation',
  megadeal: 'Major deal',
  capex: 'Capex / investment',
  m_and_a: 'M&A',
  earnings_guide: 'Earnings / guidance',
  exec: 'Leadership',
  product: 'Product / tech',
  other: 'Other',
}

function formatLaneId(id: string, laneLabels: Map<string, string>): string {
  return laneLabels.get(id) ?? id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatPublishedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function sourceBadge(type: MaterialNewsRow['source_type']): string {
  if (type === 'sec_8k') return 'SEC 8-K'
  if (type === 'fmp_press') return 'Press release'
  return 'News'
}

const SUBSCRIBE_BANNERS: Record<string, string> = {
  confirmed: 'Subscription confirmed. You will receive hourly digests when new material news is published.',
  unsubscribed: 'You have been unsubscribed from material news emails.',
  error: 'Something went wrong with that link. Try subscribing again.',
}

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<MaterialNewsRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const subscribeBanner = useMemo(() => {
    const key = searchParams.get('subscribed')
    if (!key) return null
    return SUBSCRIBE_BANNERS[key] ?? null
  }, [searchParams])

  useEffect(() => {
    if (!searchParams.get('subscribed')) return
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      next.delete('subscribed')
      setSearchParams(next, { replace: true })
    }, 8000)
    return () => window.clearTimeout(t)
  }, [searchParams, setSearchParams])

  const laneLabels = useMemo(() => {
    const root = loadNewsAnchors()
    const m = new Map<string, string>()
    for (const [id, lane] of Object.entries(root.lanes)) {
      m.set(id, lane.label)
    }
    return m
  }, [])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) {
      setError('Supabase is not configured in this build.')
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data, error: qErr } = await sb
        .from('material_news')
        .select(
          'id, published_at, headline, summary, impact_score, category, lane_ids, tickers, source_type, source_url, anchor_symbol',
        )
        .order('published_at', { ascending: false })
        .limit(40)

      if (cancelled) return
      if (qErr) {
        setError(qErr.message)
        setRows(null)
      } else {
        setRows((data ?? []) as MaterialNewsRow[])
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-moat-ink">Material news</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            High-impact events from various sectors. The true movers!
          </p>
        </div>
        <NewsSubscribeButton />
      </header>

      {subscribeBanner && (
        <p
          className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {subscribeBanner}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && rows && rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No material items yet. Run the news pipeline after applying the Supabase migration.
        </p>
      )}

      <ul className="space-y-5">
        {(rows ?? []).map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-900/5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <time dateTime={item.published_at}>{formatPublishedAt(item.published_at)}</time>
              <span className="text-slate-300">·</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                {sourceBadge(item.source_type)}
              </span>
              <span className="text-slate-300">·</span>
              <span>Impact {item.impact_score}/10</span>
              <span className="text-slate-300">·</span>
              <span>{CATEGORY_LABELS[item.category] ?? item.category}</span>
            </div>

            <h2 className="mt-2 text-lg font-semibold text-moat-ink">
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-moat-accent hover:underline"
                >
                  {item.headline}
                </a>
              ) : (
                item.headline
              )}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.summary}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {item.lane_ids.map((lid) => (
                <span
                  key={lid}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                >
                  {formatLaneId(lid, laneLabels)}
                </span>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {item.tickers.map((t) => (
                <Link
                  key={t}
                  to={`/?ticker=${encodeURIComponent(t)}`}
                  className="rounded-md bg-moat-ink/5 px-2 py-0.5 text-xs font-semibold text-moat-ink hover:bg-moat-ink/10"
                >
                  {t}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
