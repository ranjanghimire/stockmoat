import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { computeMoatAnalysis, type MoatAnalysis } from './lib/computeMoatAnalysis'
import { DEMO_TICKERS, PROFILE_ORDER } from './lib/demoTickerMap'
import { isYahooDevProvider, shouldFetchFmpPeerMedians } from './lib/dataSource'
import { buildCompanyFacts } from './lib/fmp/buildCompanyFacts'
import { fetchCompanyRawPack } from './lib/fmp/fetchCompanyRawPack'
import { EMPTY_PEER_MEDIANS, fetchPeerMedians } from './lib/fmp/peerMedians'
import { getFmpApiKey } from './lib/fmp/http'
import { mapFmpSectorToProfile } from './lib/fmp/mapSectorToProfile'
import { fetchYahooCompanyPackDev } from './lib/yahoo/fetchYahooCompanyPackDev'
import { loadSectorProfiles } from './lib/loadSectorProfiles'
import { createLiveMetricEvaluator } from './lib/liveMetricEvaluator'
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

  const [analysis, setAnalysis] = useState<MoatAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = useCallback(async () => {
    const sym = submitted.trim().toUpperCase() || 'MSFT'
    const useYahoo = isYahooDevProvider()
    const fmpKey = getFmpApiKey()

    if (!useYahoo && !fmpKey) {
      setError(
        'Missing FMP API key. For dev you can use Yahoo instead: leave `VITE_USE_FMP` unset and run `npm run dev`. To use FMP, add fmpApiKey=YOUR_KEY to .env.local and set VITE_USE_FMP=true, then restart Vite.',
      )
      setAnalysis(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const pack = useYahoo ? await fetchYahooCompanyPackDev(sym) : await fetchCompanyRawPack(sym, fmpKey)

      const facts = buildCompanyFacts(sym, pack)
      const peerMedians = useYahoo
        ? EMPTY_PEER_MEDIANS
        : shouldFetchFmpPeerMedians()
          ? await fetchPeerMedians(pack.peers, fmpKey)
          : EMPTY_PEER_MEDIANS

      const routing =
        profileMode === 'auto'
          ? mapFmpSectorToProfile(facts.sector, facts.industry)
          : { profileId: manualProfile, subIndustryHint: facts.industry }

      const root = loadSectorProfiles()
      const profile = root.profiles[routing.profileId]
      if (!profile) {
        throw new Error(`Unknown profile id: ${routing.profileId}`)
      }

      const resolved = resolveProfileMetrics(routing.profileId, profile, {
        itVariant: profileMode === 'manual' ? DEMO_TICKERS[sym]?.itVariant : undefined,
        subIndustryHint: routing.subIndustryHint,
      })

      const peerSnapshot = peerMedians.n > 0 ? peerMedians : null
      const evaluate = createLiveMetricEvaluator(sym, facts, peerSnapshot)

      const result = computeMoatAnalysis(
        sym,
        facts.companyName,
        routing.profileId,
        resolved.metrics,
        resolved.itVariant,
        evaluate,
        {
          sector: facts.sector,
          industry: facts.industry,
          dataSource: useYahoo ? 'yahoo_dev' : 'fmp',
        },
      )

      setAnalysis(result)
    } catch (e) {
      setAnalysis(null)
      setError(e instanceof Error ? e.message : 'Something went wrong while loading market data.')
    } finally {
      setLoading(false)
    }
  }, [submitted, profileMode, manualProfile])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void runAnalysis()
    }, 0)
    return () => window.clearTimeout(id)
  }, [runAnalysis])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(tickerInput.trim().toUpperCase() || 'MSFT')
  }

  return (
    <div className="min-h-dvh text-moat-ink">
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moat-accent-dim">StockMoat</p>
            <h1 className="mt-2 font-display text-4xl md:text-5xl">Find the quiet value</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              Single-ticker view powered by your sector YAML. In <span className="font-medium">dev</span>, defaults
              to <span className="font-medium">Yahoo Finance</span> via one Vite server call (no FMP peer fan-out). Set{' '}
              <span className="font-mono">VITE_USE_FMP=true</span> and an FMP key in <span className="font-mono">.env.local</span>{' '}
              to use Financial Modeling Prep. Optional: <span className="font-mono">VITE_FMP_FETCH_PEERS=true</span>{' '}
              in dev to restore peer median requests when on FMP.
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
              disabled={loading}
              className="rounded-xl bg-moat-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-moat-accent-dim disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? 'Loading…' : 'Analyze'}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
        ) : null}

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
                Auto (sector map)
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
              Auto maps <span className="font-medium">sector / industry</span> strings into the closest YAML profile
              (from Yahoo in dev, or FMP when <span className="font-mono">VITE_USE_FMP=true</span>). Manual overrides
              that mapping (still uses the same live fundamentals source).
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
              dataSource={analysis.dataSource}
              sector={analysis.sector}
              industry={analysis.industry}
            />
            <PillarBars analysis={analysis} />
            <MetricTable analysis={analysis} />
          </>
        ) : !loading && !error ? (
          <p className="text-sm text-slate-600">Enter a ticker to load data.</p>
        ) : null}

        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-6 text-sm text-slate-600">
          <h3 className="font-display text-lg text-moat-ink">Sample tickers (demo routing hints)</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {Object.keys(DEMO_TICKERS).join(', ')} — IT names still respect industry strings for the software vs semis
            split when auto profile is Information Technology.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/60 py-6 text-center text-xs text-slate-500 backdrop-blur">
        Data: dev defaults to Yahoo Finance through the Vite dev server; production builds use FMP when{' '}
        <span className="font-mono">fmpApiKey</span> is set at build time. Prefer a backend proxy so keys stay off public
        bundles.
      </footer>
    </div>
  )
}
