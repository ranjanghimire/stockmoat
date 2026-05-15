import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MoatAnalysis } from '../lib/computeMoatAnalysis'
import {
  companyNameWithTicker,
  deriveMoatKeyTakeaway,
  type KeyTakeawayLine,
  type TakeawayTone,
} from '../lib/deriveMoatKeyTakeaway'
import { fetchCompanyEditorialSummaries } from '../lib/fetchCompanyEditorialSummaries'

function toneClass(tone: TakeawayTone): string {
  switch (tone) {
    case 'positive':
      return 'text-emerald-900'
    case 'negative':
      return 'text-rose-900'
    case 'caution':
      return 'text-amber-950'
    default:
      return 'text-slate-800'
  }
}

function TakeawayBlock({ line, prominent }: { line: KeyTakeawayLine; prominent?: boolean }) {
  return (
    <p
      className={`${toneClass(line.tone)} ${prominent ? 'text-base font-medium leading-snug md:text-lg' : 'text-sm leading-snug text-slate-700'}`}
    >
      {line.text}
    </p>
  )
}

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
      <div className="h-4 w-40 rounded bg-slate-200/90" />
      <div className="space-y-2 pt-1">
        <div className="h-4 w-full max-w-3xl rounded bg-slate-100" />
        <div className="h-4 w-full max-w-2xl rounded bg-slate-100" />
        <div className="h-4 w-full max-w-xl rounded bg-slate-100" />
      </div>
    </div>
  )
}

function MoatEditorialSubsections({ displayName, ticker }: { displayName: string; ticker: string }) {
  const [moatBody, setMoatBody] = useState<string | null>(null)
  const [howTheyMakeMoneyBody, setHowTheyMakeMoneyBody] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchCompanyEditorialSummaries(ticker).then(({ moatBody: m, howTheyMakeMoneyBody: h }) => {
      if (cancelled) return
      setMoatBody(m)
      setHowTheyMakeMoneyBody(h)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [ticker])

  if (!ready) return null
  if (!moatBody && !howTheyMakeMoneyBody) return null

  const co = companyNameWithTicker(displayName, ticker)

  return (
    <div className="space-y-8">
      {moatBody ? (
        <div>
          <SubsectionLabel>What&apos;s the moat?</SubsectionLabel>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800 md:text-base">{moatBody}</p>
        </div>
      ) : null}
      {howTheyMakeMoneyBody ? (
        <div>
          <SubsectionLabel sentenceCase>
            How {co} makes money?
          </SubsectionLabel>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800 md:text-base">{howTheyMakeMoneyBody}</p>
        </div>
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
  const takeaway = useMemo(() => (analysis ? deriveMoatKeyTakeaway(analysis) : null), [analysis])

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
    if (!analysis || !takeaway?.primary) {
      return (
        <p className="text-sm leading-snug text-slate-600">
          Enter a ticker and choose <span className="font-medium">Analyze</span> to load the key takeaway for{' '}
          <span className="font-mono font-semibold">{ticker}</span>.
        </p>
      )
    }

    const sym = analysis.ticker.trim().toUpperCase()

    return (
      <div className="space-y-8">
        <div>
          <SubsectionLabel>Key takeaway</SubsectionLabel>
          <div className="mt-2 space-y-3">
            <TakeawayBlock line={takeaway.primary} prominent />
            {takeaway.secondary ? <TakeawayBlock line={takeaway.secondary} /> : null}
          </div>
        </div>
        <MoatEditorialSubsections key={sym} displayName={analysis.displayName} ticker={analysis.ticker} />
      </div>
    )
  })()

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-md shadow-slate-900/5 backdrop-blur md:p-6">
      <div className="flex flex-col gap-1 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-xl tracking-tight text-moat-ink md:text-2xl">MOAT ANALYSIS</h2>
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
