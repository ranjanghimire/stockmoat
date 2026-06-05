import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PROFILE_ORDER } from '../lib/demoTickerMap'

interface ScoreHeroProps {
  score: number
  ticker: string
  name: string
  profileLabel: string
  anyGateFail: boolean
  scoreCap: number
  dataSource?: 'fmp' | 'demo' | 'yahoo_dev'
  sector?: string
  industry?: string
  headquarters?: string
  profileMode?: 'auto' | 'manual'
  manualProfile?: string
  onScoringProfileChange?: (next: { mode: 'auto' | 'manual'; manualProfile: string }) => void
  delayedPrice?: { value: number; currency: string; fetchedAt: number }
  /** When true, hide the next-earnings row (Yahoo dev path has no FMP key). */
  nextEarningsOmit?: boolean
  /** Next earnings from DB and/or live FMP fallback (see HomePage). */
  nextEarnings?:
    | { status: 'loading' }
    | { status: 'ready'; dateLabel: string; fromLiveApi: boolean }
    | { status: 'empty' }
    | { status: 'error'; message: string }
    | null
}

function formatProfileId(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function dataSourceLabel(ds: string | undefined): string {
  if (ds === 'fmp') return 'Financial Modeling Prep (live)'
  if (ds === 'yahoo_dev') return 'Yahoo Finance (dev — yahoo-finance2 / one server call; not Python yfinance)'
  return 'demo / offline'
}

function formatDelayedPriceMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

function formatPriceSnapshotTime(fetchedAt: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(fetchedAt))
  } catch {
    return ''
  }
}

export function ScoreHero({
  score,
  ticker,
  name,
  profileLabel,
  anyGateFail,
  scoreCap,
  dataSource = 'demo',
  sector,
  industry,
  headquarters,
  profileMode = 'auto',
  manualProfile = 'consumer_staples_discretionary_general',
  onScoringProfileChange,
  delayedPrice,
}: ScoreHeroProps) {
  const hue = Math.round(120 - (score / 10) * 70)
  const yahooSymbol = ticker.trim().toUpperCase().replace(/\./g, '-')
  const yahooFinanceUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/`

  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [draftMode, setDraftMode] = useState<'auto' | 'manual'>(profileMode)
  const [draftManual, setDraftManual] = useState(manualProfile)

  useEffect(() => {
    if (!profileModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [profileModalOpen])

  useEffect(() => {
    if (!profileModalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [profileModalOpen])

  const applyProfile = () => {
    onScoringProfileChange?.({ mode: draftMode, manualProfile: draftManual })
    setProfileModalOpen(false)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: `hsl(${hue} 45% 70%)` }}
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Value moat score</p>
          <h2 className="mt-1 font-display text-4xl text-moat-ink md:text-5xl">
            {ticker}
            <span className="ml-3 text-2xl font-sans font-medium text-slate-500 md:text-3xl">{name}</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Sector profile: <span className="font-medium text-moat-ink">{profileLabel}</span>. <br />
            Data: <span className="font-medium text-moat-ink">{dataSourceLabel(dataSource)}</span>
            <br />
            {delayedPrice ? (
              <>
                <span className="font-medium text-moat-ink">Price (delayed):</span>{' '}
                <span className="tabular-nums font-medium text-moat-ink">
                  {formatDelayedPriceMoney(delayedPrice.value, delayedPrice.currency)}
                </span>
                <span className="text-slate-400">
                  {' '}
                  · snapshot {formatPriceSnapshotTime(delayedPrice.fetchedAt)} · we refresh this quote at most every
                  60 minutes
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-moat-ink">Price (delayed):</span> <span className="text-slate-500">—</span>
              </>
            )}
            <br />
            <span>
              Headquarters{' '}
              <span className="font-medium text-moat-ink">{headquarters?.trim() ? headquarters : '—'}</span>
            </span>
            <br />
            <span className="mt-1 inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>
                Sector <span className="font-medium text-moat-ink">{sector?.trim() ? sector : '—'}</span>
                {industry?.trim() ? (
                  <>
                    {' '}
                    / <span className="font-medium text-moat-ink">{industry}</span>
                  </>
                ) : null}
              </span>
              {onScoringProfileChange ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraftMode(profileMode)
                    setDraftManual(manualProfile)
                    setProfileModalOpen(true)
                  }}
                  className="rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-moat-accent underline decoration-moat-accent/30 underline-offset-2 transition hover:bg-moat-accent/5 hover:text-moat-accent-dim hover:decoration-moat-accent-dim"
                >
                  Edit
                </button>
              ) : null}
            </span>
            <br />
            <a
              href={yahooFinanceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-moat-accent underline decoration-moat-accent/30 underline-offset-2 transition hover:text-moat-accent-dim hover:decoration-moat-accent-dim"
            >
              {'Quote & news on Yahoo Finance'}
            </a>
            <span className="text-slate-400"> (opens in new tab)</span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white shadow-inner"
            style={{
              background: `conic-gradient(hsl(${hue} 42% 42%) ${score * 36}deg, #e2e8f0 0)`,
            }}
            aria-label={`Moat score ${score} out of ten`}
          >
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white">
              <span className="font-display text-4xl leading-none text-moat-ink">{score}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">/ 10</span>
            </div>
          </div>
          {anyGateFail ? (
            <p className="max-w-xs text-right text-xs text-amber-800">
              A hard <span className="font-semibold">gate</span> failed; score capped at {scoreCap} per config.
            </p>
          ) : (
            <p className="text-right text-xs text-slate-500">No hard gate failures.</p>
          )}
        </div>
      </div>

      {profileModalOpen && onScoringProfileChange
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4 py-8 backdrop-blur-sm"
              role="presentation"
              onClick={() => setProfileModalOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-edit-title"
                className="my-auto w-full max-h-[min(90dvh,36rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="profile-edit-title" className="font-display text-lg text-moat-ink">
                  Scoring profile
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Auto maps the moat template from the company&apos;s sector. Manual picks a specific sector profile
                  regardless of sector.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftMode('auto')}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                      draftMode === 'auto' ? 'bg-moat-ink text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftMode('manual')}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                      draftMode === 'manual'
                        ? 'bg-moat-ink text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    Manual
                  </button>
                </div>
                {draftMode === 'manual' ? (
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile</span>
                    <select
                      value={draftManual}
                      onChange={(e) => setDraftManual(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner outline-none focus:ring-2 focus:ring-moat-accent/30"
                    >
                      {PROFILE_ORDER.map((id) => (
                        <option key={id} value={id}>
                          {formatProfileId(id)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setProfileModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyProfile}
                    className="rounded-xl bg-moat-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-moat-accent-dim"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
