import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ANALYSIS_CACHE_MAX_ENTRIES,
  ANALYSIS_CACHE_TTL_MS,
  analysisCacheKey,
  type AnalysisCacheEntry,
  readAnalysisCache,
  writeAnalysisCache,
} from '../lib/analysisCache'
import { computeMoatAnalysis, type MoatAnalysis } from '../lib/computeMoatAnalysis'
import { DEMO_TICKERS } from '../lib/demoTickerMap'
import { DELAYED_PRICE_SNAPSHOT_TTL_MS } from '../lib/delayedPricePolicy'
import { isYahooDevProvider, shouldFetchFmpPeerMedians } from '../lib/dataSource'
import { buildCompanyFacts, listingCurrencyFromPack } from '../lib/fmp/buildCompanyFacts'
import { fetchCompanyRawPack } from '../lib/fmp/fetchCompanyRawPack'
import { EMPTY_PEER_MEDIANS, fetchPeerMedians } from '../lib/fmp/peerMedians'
import { getFmpApiKey } from '../lib/fmp/http'
import { mapFmpSectorToProfile } from '../lib/fmp/mapSectorToProfile'
import { buildMoatFundamentalsSnapshot } from '../lib/moatFundamentalsSnapshot'
import { fetchPriceCharts } from '../lib/fetchPriceCharts'
import { fetchYahooCompanyPackDev } from '../lib/yahoo/fetchYahooCompanyPackDev'
import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'
import { loadSectorProfiles } from '../lib/loadSectorProfiles'
import { createLiveMetricEvaluator } from '../lib/liveMetricEvaluator'
import { resolveProfileMetrics } from '../lib/resolveProfileMetrics'
import { BalanceFundamentalCharts } from '../components/BalanceFundamentalCharts'
import { FundamentalsSummaryCard } from '../components/FundamentalsSummaryCard'
import { IncomeFundamentalCharts } from '../components/IncomeFundamentalCharts'
import { PillarBars } from '../components/PillarBars'
import { PillarDetailPanel } from '../components/PillarDetailPanel'
import { ScoreHero } from '../components/ScoreHero'
import { PriceChartsPanel } from '../components/PriceChartsPanel'

function formatProfileId(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function readTickerQuery(): string {
  if (typeof window === 'undefined') return 'MSFT'
  const raw = new URLSearchParams(window.location.search).get('ticker')?.trim().toUpperCase()
  if (raw && /^[A-Z0-9.-]{1,12}$/.test(raw)) return raw
  return 'MSFT'
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tickerInput, setTickerInput] = useState(readTickerQuery)
  const [profileMode, setProfileMode] = useState<'auto' | 'manual'>('auto')
  const [manualProfile, setManualProfile] = useState<string>('consumer_staples_discretionary_general')
  const [submitted, setSubmitted] = useState(readTickerQuery)

  const [analysis, setAnalysis] = useState<MoatAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null)
  const analysisCacheRef = useRef(new Map<string, AnalysisCacheEntry>())
  const chartRefreshRef = useRef(false)
  const [priceCharts, setPriceCharts] = useState<PriceChartsPayload | null>(null)
  const [priceChartsLoading, setPriceChartsLoading] = useState(false)
  const [priceChartsError, setPriceChartsError] = useState<string | null>(null)
  const [chartLoadGeneration, setChartLoadGeneration] = useState(0)

  const tickerFromParams = searchParams.get('ticker')?.trim().toUpperCase() ?? ''
  useEffect(() => {
    if (!tickerFromParams || !/^[A-Z0-9.-]{1,12}$/.test(tickerFromParams)) return
    const id = window.setTimeout(() => {
      setTickerInput((prev) => (prev === tickerFromParams ? prev : tickerFromParams))
      setSubmitted((prev) => (prev === tickerFromParams ? prev : tickerFromParams))
    }, 0)
    return () => window.clearTimeout(id)
  }, [tickerFromParams])

  useEffect(() => {
    const id = window.setTimeout(() => setSelectedPillar(null), 0)
    return () => window.clearTimeout(id)
  }, [submitted])

  useEffect(() => {
    if (!selectedPillar) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedPillar(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPillar])

  const runAnalysis = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    const sym = submitted.trim().toUpperCase() || 'MSFT'
    const useYahoo = isYahooDevProvider()
    const fmpKey = getFmpApiKey()

    if (!useYahoo && !fmpKey) {
      setError(
        'Missing FMP API key. Add fmpApiKey=YOUR_KEY to .env.local and restart Vite (default dev path). Optional: set VITE_USE_YAHOO=true to try Yahoo via the yahoo-finance2 package (not Python yfinance) — Yahoo often rate-limits and may fail.',
      )
      setAnalysis(null)
      setFromCache(false)
      return
    }

    const cacheKey = analysisCacheKey(sym, useYahoo, profileMode, manualProfile)
    if (!opts?.forceRefresh) {
      const cached = readAnalysisCache(
        analysisCacheRef.current,
        cacheKey,
        Date.now(),
        ANALYSIS_CACHE_TTL_MS,
      )
      if (cached) {
        const d = cached.delayedPrice
        const priceSnapshotFresh =
          d !== undefined &&
          Number.isFinite(d.value) &&
          d.value > 0 &&
          Date.now() - d.fetchedAt <= DELAYED_PRICE_SNAPSHOT_TTL_MS
        if (priceSnapshotFresh) {
          setFromCache(true)
          setAnalysis(cached)
          setError(null)
          return
        }
      }
    }

    setFromCache(false)
    setLoading(true)
    setError(null)
    try {
      const pack = useYahoo
        ? await fetchYahooCompanyPackDev(sym, { refresh: opts?.forceRefresh === true })
        : await fetchCompanyRawPack(sym, fmpKey)

      const facts = buildCompanyFacts(sym, pack)
      const peerMedians = useYahoo
        ? EMPTY_PEER_MEDIANS
        : shouldFetchFmpPeerMedians()
          ? await fetchPeerMedians(pack.peers, fmpKey, { subjectSymbol: sym })
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
          fundamentals: buildMoatFundamentalsSnapshot(facts, pack),
        },
      )

      const now = Date.now()
      const listingCurrency = listingCurrencyFromPack(pack)
      const analysisWithPrice: MoatAnalysis = {
        ...result,
        delayedPrice:
          facts.price !== undefined && facts.price > 0
            ? { value: facts.price, currency: listingCurrency, fetchedAt: now }
            : undefined,
      }

      writeAnalysisCache(
        analysisCacheRef.current,
        cacheKey,
        { savedAt: now, analysis: analysisWithPrice },
        ANALYSIS_CACHE_MAX_ENTRIES,
      )
      setAnalysis(analysisWithPrice)
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

  useEffect(() => {
    const sym = submitted.trim().toUpperCase() || 'MSFT'
    const refresh = chartRefreshRef.current
    chartRefreshRef.current = false
    const ac = new AbortController()
    const id = window.setTimeout(() => {
      setPriceCharts(null)
      setPriceChartsError(null)
      setPriceChartsLoading(true)
      void fetchPriceCharts(sym, { refresh, signal: ac.signal })
        .then((d) => {
          if (ac.signal.aborted) return
          setPriceCharts(d)
          setPriceChartsError(null)
        })
        .catch((e) => {
          if (ac.signal.aborted) return
          setPriceCharts(null)
          setPriceChartsError(e instanceof Error ? e.message : 'Price charts failed to load.')
        })
        .finally(() => {
          if (ac.signal.aborted) return
          setPriceChartsLoading(false)
        })
    }, 0)
    return () => {
      window.clearTimeout(id)
      ac.abort()
    }
  }, [submitted, chartLoadGeneration])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const sym = tickerInput.trim().toUpperCase() || 'MSFT'
    setSubmitted(sym)
    setSearchParams({ ticker: sym }, { replace: true })
  }

  return (
    <div className="min-h-dvh text-moat-ink">
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moat-accent-dim">StockMoat</p>
            <h1 className="mt-2 font-display text-4xl md:text-5xl">Find the quiet value</h1>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 md:flex-row md:items-center">
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
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  chartRefreshRef.current = true
                  setChartLoadGeneration((n) => n + 1)
                  void runAnalysis({ forceRefresh: true })
                }}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
                title="Bypass in-memory cache and refetch from Yahoo or FMP"
              >
                {loading ? 'Wait…' : 'Refresh'}
              </button>
            </form>
            {fromCache ? (
              <p className="max-w-md text-xs text-slate-500 md:text-right">
                Showing in-memory cached analysis (same ticker & profile, up to{' '}
                {Math.round(ANALYSIS_CACHE_TTL_MS / 60_000)} min). Use Refresh to pull fresh fundamentals.
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
        ) : null}

        <PriceChartsPanel
          ticker={submitted.trim().toUpperCase() || 'MSFT'}
          data={priceCharts}
          loading={priceChartsLoading}
          error={priceChartsError}
        />

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
              profileMode={profileMode}
              manualProfile={manualProfile}
              onScoringProfileChange={({ mode, manualProfile: mp }) => {
                setProfileMode(mode)
                setManualProfile(mp)
              }}
              delayedPrice={analysis.delayedPrice}
            />
            {analysis.fundamentals ? (
              <FundamentalsSummaryCard fundamentals={analysis.fundamentals} dataSource={analysis.dataSource} />
            ) : null}
            <PillarBars
              analysis={analysis}
              selectedPillar={selectedPillar}
              onSelectPillar={setSelectedPillar}
            />
            <PillarDetailPanel analysis={analysis} pillar={selectedPillar} onClose={() => setSelectedPillar(null)} />
            {analysis.fundamentals?.incomeCharts ? (
              <IncomeFundamentalCharts charts={analysis.fundamentals.incomeCharts} />
            ) : null}
            {analysis.fundamentals?.balanceCharts ? (
              <BalanceFundamentalCharts charts={analysis.fundamentals.balanceCharts} />
            ) : null}
          </>
        ) : !loading && !error ? (
          <p className="text-sm text-slate-600">Enter a ticker to load data.</p>
        ) : null}
      </main>

      <footer className="border-t border-slate-200/80 bg-white/60 py-6 text-center text-xs text-slate-500 backdrop-blur">
        Client keeps a small in-memory analysis cache (10 min) per ticker/profile; use Refresh to bypass. FMP peer
        medians load in dev by default (<span className="font-mono">VITE_FMP_FETCH_PEERS=false</span> to skip). Optional Yahoo
        company pack (<span className="font-mono">VITE_USE_YAHOO=true</span>) uses yahoo-finance2 on the Vite dev server. Price
        charts prefer FMP historical EOD (~2y weekly + ~6mo daily OHLC), then Yahoo if FMP fails or the key is missing. Production builds use FMP for fundamentals when <span className="font-mono">fmpApiKey</span> is set at
        build time. Prefer a backend proxy so keys stay off public bundles. The <span className="font-mono">/screen</span> view
        reads batch scores from Supabase when <span className="font-mono">VITE_SUPABASE_URL</span> and{' '}
        <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> are set.
      </footer>
    </div>
  )
}
