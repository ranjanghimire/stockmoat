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
import { enrichAnalysisWithFairValue } from '../lib/fairValue/enrichAnalysisWithFairValue'
import { DEMO_TICKERS } from '../lib/demoTickerMap'
import { DELAYED_PRICE_SNAPSHOT_TTL_MS } from '../lib/delayedPricePolicy'
import { isYahooDevProvider, shouldFetchFmpPeerMedians } from '../lib/dataSource'
import { buildCompanyFacts, listingCurrencyFromPack } from '../lib/fmp/buildCompanyFacts'
import type { CompanyRawPack } from '../lib/fmp/fetchCompanyRawPack'
import { fetchCompanyRawPack } from '../lib/fmp/fetchCompanyRawPack'
import {
  fetchHomeFmpBundleViaEdge,
  forwardGrowthNeedsBackgroundRefresh,
  quoteSnapshotMsFromEdgeMeta,
  refreshHomeFmpTickerViaEdge,
  shouldUseHomeFmpEdgeCache,
  type HomeFmpEdgeMeta,
  type HomeFmpRefreshResult,
} from '../lib/fmp/fetchHomeFmpViaEdge'
import {
  clearForwardGrowthCagrUniverseCache,
  fetchForwardGrowthCagrUniverse,
  forwardGrowthScoreFromCharts,
} from '../lib/fmp/forwardRevenueGrowthScore'
import { forwardGrowthChartsUsable, type ForwardGrowthCharts as ForwardGrowthChartsData } from '../lib/fmp/parseForwardEstimates'
import { EMPTY_PEER_MEDIANS, fetchPeerMedians } from '../lib/fmp/peerMedians'
import { getFmpApiKey } from '../lib/fmp/http'
import {
  fetchFmpNextEarningsDate,
  formatNextEarningsDisplay,
  utcCalendarDateString,
} from '../lib/fmp/fetchFmpNextEarningsDate'
import { mapFmpSectorToProfile } from '../lib/fmp/mapSectorToProfile'
import { buildMoatFundamentalsSnapshot } from '../lib/moatFundamentalsSnapshot'
import { fetchPriceCharts } from '../lib/fetchPriceCharts'
import { fetchYahooCompanyPackDev } from '../lib/yahoo/fetchYahooCompanyPackDev'
import type { PriceChartsPayload } from '../lib/yahoo/weeklyChartTypes'
import { loadSectorProfiles } from '../lib/loadSectorProfiles'
import { createLiveMetricEvaluator } from '../lib/liveMetricEvaluator'
import { resolveProfileMetrics } from '../lib/resolveProfileMetrics'
import { KeyTakeawaySection } from '../components/KeyTakeawaySection'
import { MoatAnalysisSection } from '../components/MoatAnalysisSection'
import { BalanceFundamentalCharts } from '../components/BalanceFundamentalCharts'
import { FundamentalsSummaryCard } from '../components/FundamentalsSummaryCard'
import { ValuationSnapshotCard } from '../components/ValuationSnapshotCard'
import { FairValueCard } from '../components/FairValueCard'
import { ForwardGrowthCharts as ForwardGrowthChartsCard } from '../components/ForwardGrowthCharts'
import { IncomeFundamentalCharts } from '../components/IncomeFundamentalCharts'
import { PillarBars } from '../components/PillarBars'
import { PillarDetailPanel } from '../components/PillarDetailPanel'
import { ScoreHero } from '../components/ScoreHero'
import { PriceChartsPanel } from '../components/PriceChartsPanel'
import { getSupabaseBrowserClient } from '../lib/supabaseClient'
import type { PeerMedians } from '../lib/fmp/peerMedians'

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

type NextEarningsHomeState =
  | { status: 'loading' }
  | { status: 'ready'; dateLabel: string; fromLiveApi: boolean }
  | { status: 'empty' }
  | { status: 'error'; message: string }

async function resolveForwardGrowthScoreClient(
  symbol: string,
  charts: ForwardGrowthChartsData | undefined,
): Promise<number | null> {
  const sb = getSupabaseBrowserClient()
  if (!sb || !forwardGrowthChartsUsable(charts)) return null
  try {
    const universe = await fetchForwardGrowthCagrUniverse(sb)
    return forwardGrowthScoreFromCharts(symbol, charts, universe)
  } catch {
    return null
  }
}

function buildMoatFromPack(
  sym: string,
  pack: CompanyRawPack,
  peerMedians: PeerMedians,
  edgeForwardGrowth: ForwardGrowthChartsData | undefined,
  edgeQuoteMeta: HomeFmpEdgeMeta | null,
  useYahoo: boolean,
  profileMode: 'auto' | 'manual',
  manualProfile: string,
): MoatAnalysis {
  const facts = buildCompanyFacts(sym, pack)
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
  const savedAt = Date.now()
  const priceSnapshotMs = quoteSnapshotMsFromEdgeMeta(edgeQuoteMeta) ?? savedAt
  const listingCurrency = listingCurrencyFromPack(pack)

  const result = enrichAnalysisWithFairValue(
    computeMoatAnalysis(
      sym,
      facts.companyName,
      routing.profileId,
      resolved.metrics,
      resolved.itVariant,
      evaluate,
      {
        sector: facts.sector,
        industry: facts.industry,
        headquarters: facts.headquarters,
        dataSource: useYahoo ? 'yahoo_dev' : 'fmp',
        fundamentals: buildMoatFundamentalsSnapshot(
          facts,
          pack,
          peerSnapshot,
          facts.sector,
          edgeForwardGrowth,
        ),
        facts,
        peers: peerSnapshot,
      },
    ),
    { facts, peers: peerSnapshot, pack },
  )

  return {
    ...result,
    delayedPrice:
      facts.price !== undefined && facts.price > 0
        ? { value: facts.price, currency: listingCurrency, fetchedAt: priceSnapshotMs }
        : undefined,
  }
}

function NextEarningsStrip({ symbol, state }: { symbol: string; state: NextEarningsHomeState }) {
  return (
    <section
      className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 text-sm text-slate-700 shadow-sm backdrop-blur-sm"
      aria-label="Next earnings date"
    >
      <span className="font-semibold text-moat-ink">Next earnings</span>
      <span className="ml-2 font-mono text-xs text-slate-600">{symbol}</span>
      <span className="mx-2 text-slate-300">·</span>
      {state.status === 'loading' ? (
        <span className="text-slate-600">Loading…</span>
      ) : state.status === 'error' ? (
        <span className="text-amber-900">{state.message}</span>
      ) : state.status === 'ready' ? (
        <span className="font-medium text-moat-ink">{state.dateLabel}</span>
      ) : (
        <span className="text-slate-600">No upcoming date reported for this symbol.</span>
      )}
    </section>
  )
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
  const [nextEarningsState, setNextEarningsState] = useState<NextEarningsHomeState | null>(null)
  const [forwardGrowthScore, setForwardGrowthScore] = useState<number | null>(null)
  const [homeDataRefreshing, setHomeDataRefreshing] = useState(false)

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
    const supabaseClient = getSupabaseBrowserClient()
    const edgeHomeCache = !useYahoo && Boolean(supabaseClient) && shouldUseHomeFmpEdgeCache()

    if (!useYahoo && !fmpKey && !edgeHomeCache) {
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
    setHomeDataRefreshing(false)

    const applyRefresh = (refresh: HomeFmpRefreshResult) => {
      clearForwardGrowthCagrUniverseCache()
      const analysisWithPrice = buildMoatFromPack(
        sym,
        refresh.pack,
        refresh.peer_medians,
        refresh.forward_growth,
        refresh.meta,
        useYahoo,
        profileMode,
        manualProfile,
      )
      const score =
        refresh.forward_growth_score ??
        null
      setForwardGrowthScore(score)
      writeAnalysisCache(
        analysisCacheRef.current,
        cacheKey,
        { savedAt: Date.now(), analysis: analysisWithPrice },
        ANALYSIS_CACHE_MAX_ENTRIES,
      )
      setAnalysis(analysisWithPrice)
    }

    const queueStaleRefresh = (
      edgeQuoteMeta: HomeFmpEdgeMeta | null,
      edgeForwardGrowth: ForwardGrowthChartsData | undefined,
    ) => {
      if (!edgeHomeCache || !supabaseClient) return
      if (!forwardGrowthNeedsBackgroundRefresh(edgeQuoteMeta, edgeForwardGrowth)) return

      setHomeDataRefreshing(true)
      void refreshHomeFmpTickerViaEdge({
        supabase: supabaseClient,
        profileCacheKey: cacheKey,
        symbol: sym,
        fetchPeers: shouldFetchFmpPeerMedians(),
        forceRefresh: false,
      })
        .then((refresh) => {
          if (!refresh) return
          applyRefresh(refresh)
        })
        .finally(() => setHomeDataRefreshing(false))
    }

    try {
      let pack: CompanyRawPack
      let peerMedians = EMPTY_PEER_MEDIANS
      let edgeQuoteMeta: HomeFmpEdgeMeta | null = null
      let edgeForwardGrowth: ForwardGrowthChartsData | undefined
      let growthScore: number | null = null

      if (useYahoo) {
        pack = await fetchYahooCompanyPackDev(sym, { refresh: opts?.forceRefresh === true })
      } else if (edgeHomeCache && supabaseClient && opts?.forceRefresh) {
        const refresh = await refreshHomeFmpTickerViaEdge({
          supabase: supabaseClient,
          profileCacheKey: cacheKey,
          symbol: sym,
          fetchPeers: shouldFetchFmpPeerMedians(),
          forceRefresh: true,
        })
        if (!refresh) {
          throw new Error(
            'home-fmp-cache refresh failed. Deploy the edge function and apply DB migrations.',
          )
        }
        applyRefresh(refresh)
        setLoading(false)
        return
      } else if (edgeHomeCache && supabaseClient) {
        const bundle = await fetchHomeFmpBundleViaEdge({
          supabase: supabaseClient,
          profileCacheKey: cacheKey,
          symbol: sym,
          fetchPeers: shouldFetchFmpPeerMedians(),
        })
        if (bundle) {
          pack = bundle.pack
          peerMedians = bundle.peer_medians
          edgeQuoteMeta = bundle.meta
          edgeForwardGrowth = bundle.forward_growth
          growthScore = bundle.forward_growth_score ?? null
        } else if (fmpKey) {
          pack = await fetchCompanyRawPack(sym, fmpKey)
          peerMedians = shouldFetchFmpPeerMedians()
            ? await fetchPeerMedians(pack.peers, fmpKey, { subjectSymbol: sym })
            : EMPTY_PEER_MEDIANS
        } else {
          throw new Error(
            'home-fmp-cache Edge Function failed or is not deployed, and no FMP_API_KEY is set locally. Deploy the function and set FMP_API_KEY + migrations, or add fmpApiKey to .env.local.',
          )
        }
      } else {
        pack = await fetchCompanyRawPack(sym, fmpKey)
        peerMedians = shouldFetchFmpPeerMedians()
          ? await fetchPeerMedians(pack.peers, fmpKey, { subjectSymbol: sym })
          : EMPTY_PEER_MEDIANS
      }

      const analysisWithPrice = buildMoatFromPack(
        sym,
        pack,
        peerMedians,
        edgeForwardGrowth,
        edgeQuoteMeta,
        useYahoo,
        profileMode,
        manualProfile,
      )

      if (growthScore == null && analysisWithPrice.fundamentals?.forwardGrowth) {
        growthScore = await resolveForwardGrowthScoreClient(sym, analysisWithPrice.fundamentals.forwardGrowth)
      }
      setForwardGrowthScore(growthScore)

      writeAnalysisCache(
        analysisCacheRef.current,
        cacheKey,
        { savedAt: Date.now(), analysis: analysisWithPrice },
        ANALYSIS_CACHE_MAX_ENTRIES,
      )
      setAnalysis(analysisWithPrice)
      setLoading(false)

      queueStaleRefresh(edgeQuoteMeta, edgeForwardGrowth)
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

  useEffect(() => {
    const ac = new AbortController()
    let cancelled = false

    void (async () => {
      if (isYahooDevProvider()) {
        if (!cancelled) setNextEarningsState(null)
        return
      }

      const sym = submitted.trim().toUpperCase() || 'MSFT'
      if (!cancelled) setNextEarningsState({ status: 'loading' })

      const today = utcCalendarDateString()
      const sb = getSupabaseBrowserClient()
      let dbRow: { next_earnings_date: string | null; fetch_error: string | null } | null = null

      if (sb) {
        const { data, error } = await sb
          .from('ticker_next_earnings')
          .select('next_earnings_date, fetch_error')
          .eq('symbol', sym)
          .maybeSingle()
        if (cancelled) return
        if (error) {
          setNextEarningsState({ status: 'error', message: error.message })
          return
        }
        dbRow = data as { next_earnings_date: string | null; fetch_error: string | null } | null
        if (dbRow?.fetch_error) {
          setNextEarningsState({ status: 'error', message: dbRow.fetch_error })
          return
        }
        if (dbRow?.next_earnings_date && dbRow.next_earnings_date >= today) {
          setNextEarningsState({
            status: 'ready',
            dateLabel: formatNextEarningsDisplay(dbRow.next_earnings_date),
            fromLiveApi: false,
          })
          return
        }
      }

      const fmpKey = getFmpApiKey()
      if (fmpKey) {
        try {
          const { nextDate } = await fetchFmpNextEarningsDate(sym, fmpKey, { signal: ac.signal })
          if (cancelled) return
          if (nextDate) {
            setNextEarningsState({
              status: 'ready',
              dateLabel: formatNextEarningsDisplay(nextDate),
              fromLiveApi: true,
            })
          } else {
            setNextEarningsState({ status: 'empty' })
          }
        } catch (e) {
          if (!cancelled) {
            setNextEarningsState({
              status: 'error',
              message: e instanceof Error ? e.message : String(e),
            })
          }
        }
        return
      }

      if (!cancelled) {
        if (dbRow?.next_earnings_date) {
          setNextEarningsState({
            status: 'ready',
            dateLabel: formatNextEarningsDisplay(dbRow.next_earnings_date),
            fromLiveApi: false,
          })
        } else {
          setNextEarningsState({ status: 'empty' })
        }
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [submitted])

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

        <MoatAnalysisSection
          ticker={submitted.trim().toUpperCase() || 'MSFT'}
          loading={loading}
          analysis={analysis}
          error={error}
        />

        {!isYahooDevProvider() ? (
          <NextEarningsStrip
            symbol={submitted.trim().toUpperCase() || 'MSFT'}
            state={nextEarningsState ?? { status: 'loading' }}
          />
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
              headquarters={analysis.headquarters}
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
            {analysis.fundamentals?.forwardGrowth ? (
              <ForwardGrowthChartsCard
                charts={analysis.fundamentals.forwardGrowth}
                growthScore={forwardGrowthScore}
                refreshing={homeDataRefreshing}
              />
            ) : null}
            <KeyTakeawaySection loading={loading} analysis={analysis} />
            {analysis.fundamentals?.valuation ? (
              <ValuationSnapshotCard valuation={analysis.fundamentals.valuation} />
            ) : null}
            {analysis.fundamentals?.fairValue ? (
              <FairValueCard
                fairValue={analysis.fundamentals.fairValue}
                marketPrice={analysis.delayedPrice?.value}
              />
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
        Copyright StockMoat 2026
      </footer>
    </div>
  )
}
