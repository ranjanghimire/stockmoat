import { useMemo, useState, type FormEvent } from 'react'
import { computeMoatAnalysis } from './lib/computeMoatAnalysis'
import { DEMO_TICKERS, PROFILE_ORDER } from './lib/demoTickerMap'
import { loadSectorProfiles } from './lib/loadSectorProfiles'
import { resolveProfileMetrics } from './lib/resolveProfileMetrics'
import { MetricTable } from './components/MetricTable'
import { PillarBars } from './components/PillarBars'
import { ScoreHero } from './components/ScoreHero'

function formatProfileId(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function App() {
  const [tickerInput, setTickerInput] = useState('MSFT')
  const [profileMode, setProfileMode] = useState<'auto' | 'manual'>('auto')
  const [manualProfile, setManualProfile] = useState<string>('consumer_staples_discretionary_general')
  const [submitted, setSubmitted] = useState('MSFT')

  const analysis = useMemo(() => {
    const sym = submitted.trim().toUpperCase() || 'DEMO'
    const demo = DEMO_TICKERS[sym]
    const root = loadSectorProfiles()
    const profileId =
      profileMode === 'auto'
        ? (demo?.profileId ?? 'consumer_staples_discretionary_general')
        : manualProfile
    const profile = root.profiles[profileId]
    if (!profile) {
      return null
    }
    const resolved = resolveProfileMetrics(profileId, profile, {
      itVariant: demo?.itVariant,
      subIndustryHint: demo?.subIndustryHint,
    })
    const displayName =
      demo?.name ?? `${sym} (unmapped — demo defaults)`
    return computeMoatAnalysis(sym, displayName, profileId, resolved.metrics, resolved.itVariant)
  }, [submitted, profileMode, manualProfile])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(tickerInput.trim().toUpperCase() || 'DEMO')
  }

  return (
    <div className="min-h-dvh text-moat-ink">
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moat-accent-dim">StockMoat</p>
            <h1 className="mt-2 font-display text-4xl md:text-5xl">Find the quiet value</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              Single-ticker view: sector-aware weights from YAML, mock fundamentals for UI wiring. Scanner for 1000
              names comes later.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
            <label className="sr-only" htmlFor="ticker">
              Ticker
            </label>
            <input
              id="ticker"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              placeholder="TICKER"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-lg tracking-widest shadow-inner shadow-slate-900/5 outline-none ring-moat-accent/30 focus:ring-2 md:w-44"
              maxLength={8}
            />
            <button
              type="submit"
              className="rounded-xl bg-moat-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-moat-accent-dim"
            >
              Analyze
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <section className="grid gap-4 rounded-2xl border border-slate-200/80 bg-white/60 p-4 shadow-sm backdrop-blur md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile mode</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setProfileMode('auto')}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  profileMode === 'auto'
                    ? 'bg-moat-ink text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Auto (demo map)
              </button>
              <button
                type="button"
                onClick={() => setProfileMode('manual')}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  profileMode === 'manual'
                    ? 'bg-moat-ink text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Manual profile
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Auto picks a sector profile for known tickers (JPM, MSFT, NVDA, …). Unknown tickers default to broad
              consumer.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="profile">
              Manual sector profile
            </label>
            <select
              id="profile"
              disabled={profileMode !== 'manual'}
              value={manualProfile}
              onChange={(e) => setManualProfile(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner outline-none focus:ring-2 focus:ring-moat-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {PROFILE_ORDER.map((id) => (
                <option key={id} value={id}>
                  {formatProfileId(id)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {analysis ? (
          <>
            <ScoreHero
              score={analysis.score}
              ticker={analysis.ticker}
              name={analysis.displayName}
              profileLabel={
                analysis.itVariant
                  ? `${formatProfileId(analysis.profileId)} · ${analysis.itVariant.replace('_', ' ')}`
                  : formatProfileId(analysis.profileId)
              }
              anyGateFail={analysis.anyGateFail}
              scoreCap={analysis.scoreCap}
            />
            <PillarBars analysis={analysis} />
            <MetricTable analysis={analysis} />
          </>
        ) : (
          <p className="text-sm text-rose-700">Unknown profile configuration.</p>
        )}

        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-6 text-sm text-slate-600">
          <h3 className="font-display text-lg text-moat-ink">Try these tickers (demo routing)</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {Object.keys(DEMO_TICKERS).join(', ')}
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/60 py-6 text-center text-xs text-slate-500 backdrop-blur">
        Peer ladder: GICS sub-industry → industry → industry group → sector + size band · Strict peer{' '}
        <span className="font-semibold">n ≥ 8</span> (UI shows mock peer counts).
      </footer>
    </div>
  )
}
