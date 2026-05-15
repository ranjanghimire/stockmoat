import { useMemo } from 'react'
import type { MoatAnalysis } from '../lib/computeMoatAnalysis'
import { companyNameWithTicker, deriveMoatKeyTakeaway, type KeyTakeawayLine, type TakeawayTone } from '../lib/deriveMoatKeyTakeaway'

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

function KeyTakeawaySkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-4 w-36 rounded bg-slate-200/90" />
      <div className="h-4 w-full max-w-3xl rounded bg-slate-100" />
      <div className="h-4 w-full max-w-2xl rounded bg-slate-100" />
    </div>
  )
}

export function KeyTakeawaySection({ loading, analysis }: { loading: boolean; analysis: MoatAnalysis }) {
  const takeaway = useMemo(() => deriveMoatKeyTakeaway(analysis), [analysis])

  if (!takeaway?.primary) return null

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-md shadow-slate-900/5 backdrop-blur md:p-5">
      <div className="flex flex-col gap-1 border-b border-slate-100 pb-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="font-display text-lg text-moat-ink">Key takeaway</h3>
          <p className="mt-0.5 text-xs text-slate-500">From the same fundamentals used for the moat score.</p>
        </div>
        {!loading ? (
          <div className="mt-2 md:mt-0 md:text-right">
            <CompanyHeaderLabel displayName={analysis.displayName} ticker={analysis.ticker} />
          </div>
        ) : (
          <p className="mt-2 font-mono text-sm text-slate-400 md:mt-0">{analysis.ticker.trim().toUpperCase() || '—'}</p>
        )}
      </div>
      <div className="pt-4">
        {loading ? (
          <KeyTakeawaySkeleton />
        ) : (
          <div className="space-y-3">
            <TakeawayBlock line={takeaway.primary} prominent />
            {takeaway.secondary ? <TakeawayBlock line={takeaway.secondary} /> : null}
          </div>
        )}
      </div>
    </section>
  )
}
