import type { MoatAnalysis } from '../lib/computeMoatAnalysis'
import { PILLAR_LABEL, sortPillarKeys } from '../lib/pillarMeta'

interface PillarBarsProps {
  analysis: MoatAnalysis
  selectedPillar: string | null
  onSelectPillar: (pillar: string | null) => void
}

export function PillarBars({ analysis, selectedPillar, onSelectPillar }: PillarBarsProps) {
  const ordered = sortPillarKeys(analysis.pillars)

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        Click a pillar to see every metric in that bucket, the values used, and why each line contributed to the score.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ordered.map((p) => {
          const ratio = p.weight > 0 ? Math.min(1, p.contribution / p.weight) : 0
          const pct = Math.round(ratio * 100)
          const pillarScore =
            typeof p.pillarScore === 'number' && Number.isFinite(p.pillarScore)
              ? p.pillarScore
              : Math.round((1 + 9 * ratio) * 10) / 10
          const label = PILLAR_LABEL[p.pillar] ?? p.pillar
          const isSelected = selectedPillar === p.pillar
          return (
            <button
              key={p.pillar}
              type="button"
              onClick={() => onSelectPillar(isSelected ? null : p.pillar)}
              aria-pressed={isSelected}
              aria-expanded={isSelected}
              className={`rounded-xl border p-4 text-left shadow-sm backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-moat-accent/40 ${
                isSelected
                  ? 'border-moat-accent bg-emerald-50/80 ring-1 ring-moat-accent/30'
                  : 'border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span className="text-moat-ink">{label}</span>
                <span className="shrink-0 rounded-lg bg-white/90 px-2 py-1 font-display text-lg normal-case tracking-normal text-moat-ink shadow-inner">
                  {pillarScore}
                  <span className="text-xs font-sans font-medium text-slate-400">/10</span>
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>Strength</span>
                <span className="font-medium text-moat-accent-dim">{pct}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-moat-accent transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Pillar weight {(p.weight * 100).toFixed(0)}% of model · score uses this pillar’s lines only
              </p>
              <p className="mt-2 text-[10px] font-medium text-moat-accent-dim">
                {isSelected ? 'Click again to collapse' : 'View metrics'}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
