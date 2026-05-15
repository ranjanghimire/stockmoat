import { useMemo } from 'react'
import type { MoatAnalysis } from '../lib/computeMoatAnalysis'
import { deriveMoatKeyTakeaway, type KeyTakeawayLine, type TakeawayTone } from '../lib/deriveMoatKeyTakeaway'

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

function MoatSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-4 w-40 rounded bg-slate-200/90" />
      <div className="h-3 w-28 rounded bg-slate-200/80" />
      <div className="space-y-2 pt-1">
        <div className="h-4 w-full max-w-3xl rounded bg-slate-100" />
        <div className="h-4 w-full max-w-2xl rounded bg-slate-100" />
        <div className="h-4 w-full max-w-xl rounded bg-slate-100" />
      </div>
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
    return (
      <div className="space-y-3">
        <TakeawayBlock line={takeaway.primary} prominent />
        {takeaway.secondary ? <TakeawayBlock line={takeaway.secondary} /> : null}
      </div>
    )
  })()

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-md shadow-slate-900/5 backdrop-blur md:p-6">
      <div className="flex flex-col gap-1 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-xl tracking-tight text-moat-ink md:text-2xl">MOAT ANALYSIS</h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-moat-accent-dim">Key takeaway</p>
        </div>
        {!loading && analysis ? (
          <p className="mt-2 font-mono text-sm text-slate-500 md:mt-0">{analysis.ticker}</p>
        ) : (
          <p className="mt-2 font-mono text-sm text-slate-400 md:mt-0">{ticker}</p>
        )}
      </div>
      <div className="pt-4">{body}</div>
    </section>
  )
}
