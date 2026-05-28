import { useEffect, useId, useState, type ReactNode } from 'react'
import type { MoatAnalysis } from '../lib/computeMoatAnalysis'
import { companyNameWithTicker } from '../lib/deriveMoatKeyTakeaway'
import { fetchCompanyEditorialSummaries } from '../lib/fetchCompanyEditorialSummaries'

function SubsectionLabel({ children, sentenceCase }: { children: ReactNode; sentenceCase?: boolean }) {
  return (
    <p
      className={`text-xs font-semibold text-moat-accent-dim ${sentenceCase ? 'tracking-wide' : 'uppercase tracking-[0.2em]'}`}
    >
      {children}
    </p>
  )
}

function CompanyHeaderLabel({ displayName, ticker }: { displayName: string; ticker: string }) {
  const sym = ticker.trim().toUpperCase()
  const name = displayName.trim()
  const combined = companyNameWithTicker(displayName, ticker)
  if (!name || name.toUpperCase() === sym) {
    return <span className="font-mono text-sm font-semibold text-slate-600">{sym}</span>
  }
  return (
    <span className="text-sm text-slate-700" title={combined}>
      <span className="font-medium text-moat-ink">{name}</span>{' '}
      <span className="font-mono text-slate-600">({sym})</span>
    </span>
  )
}

function MoatSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-4 w-48 rounded bg-slate-200/90" />
      <div className="space-y-2 pt-1">
        <div className="h-4 w-full max-w-3xl rounded bg-slate-100" />
        <div className="h-4 w-full max-w-2xl rounded bg-slate-100" />
      </div>
    </div>
  )
}

function CollapsibleSubsection({
  title,
  defaultOpen,
  children,
}: {
  title: ReactNode
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div className="border-b border-slate-100/90 pb-6 last:border-b-0 last:pb-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">{title}</span>
        <span
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <div id={panelId} className="mt-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function MoatEditorialSubsections({ displayName, ticker }: { displayName: string; ticker: string }) {
  const [moatBody, setMoatBody] = useState<string | null>(null)
  const [howTheyMakeMoneyBody, setHowTheyMakeMoneyBody] = useState<string | null>(null)
  const [recentDealsBody, setRecentDealsBody] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchCompanyEditorialSummaries(ticker).then(
      ({ moatBody: m, howTheyMakeMoneyBody: h, recentDealsBody: d }) => {
        if (cancelled) return
        setMoatBody(m)
        setHowTheyMakeMoneyBody(h)
        setRecentDealsBody(d)
        setReady(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [ticker])

  if (!ready) return null

  if (!moatBody && !howTheyMakeMoneyBody && !recentDealsBody) {
    return (
      <p className="text-sm leading-relaxed text-slate-500">
        No moat snapshot notes for this symbol yet.
      </p>
    )
  }

  const co = companyNameWithTicker(displayName, ticker)

  return (
    <div className="space-y-0">
      {moatBody ? (
        <CollapsibleSubsection
          defaultOpen={false}
          title={<SubsectionLabel sentenceCase>What&apos;s the moat?</SubsectionLabel>}
        >
          <p className="text-sm font-medium leading-relaxed text-slate-800 md:text-base">{moatBody}</p>
        </CollapsibleSubsection>
      ) : null}
      {howTheyMakeMoneyBody ? (
        <CollapsibleSubsection
          defaultOpen={false}
          title={
            <SubsectionLabel sentenceCase>
              How {co} makes money?
            </SubsectionLabel>
          }
        >
          <p className="text-sm font-medium leading-relaxed text-slate-800 md:text-base">{howTheyMakeMoneyBody}</p>
        </CollapsibleSubsection>
      ) : null}
      {recentDealsBody ? (
        <CollapsibleSubsection
          defaultOpen={true}
          title={<SubsectionLabel sentenceCase>Recent deals and partnerships</SubsectionLabel>}
        >
          <p className="text-sm font-medium leading-relaxed text-slate-800 md:text-base">{recentDealsBody}</p>
        </CollapsibleSubsection>
      ) : null}
    </div>
  )
}

export function MoatAnalysisSection({
  ticker,
  loading,
  analysis,
  error,
}: {
  ticker: string
  loading: boolean
  analysis: MoatAnalysis | null
  error: string | null
}) {
  const body = (() => {
    if (loading) {
      return <MoatSkeleton />
    }
    if (error) {
      return (
        <p className="text-sm leading-snug text-rose-900">
          Moat analysis could not be loaded for <span className="font-mono font-semibold">{ticker}</span>. Fix the
          issue above and try again.
        </p>
      )
    }
    if (!analysis) {
      return (
        <p className="text-sm leading-snug text-slate-600">
          Enter a ticker and choose <span className="font-medium">Analyze</span> to load moat notes for{' '}
          <span className="font-mono font-semibold">{ticker}</span>.
        </p>
      )
    }

    const sym = analysis.ticker.trim().toUpperCase()

    return <MoatEditorialSubsections key={sym} displayName={analysis.displayName} ticker={analysis.ticker} />
  })()

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-md shadow-slate-900/5 backdrop-blur md:p-6">
      <div className="flex flex-col gap-1 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-xl tracking-tight text-moat-ink md:text-2xl">MOAT SNAPSHOT</h2>
        </div>
        {!loading && analysis ? (
          <div className="mt-2 md:mt-0 md:text-right">
            <CompanyHeaderLabel displayName={analysis.displayName} ticker={analysis.ticker} />
          </div>
        ) : (
          <p className="mt-2 font-mono text-sm text-slate-400 md:mt-0">{ticker.trim().toUpperCase() || '—'}</p>
        )}
      </div>
      <div className="pt-4">{body}</div>
    </section>
  )
}
