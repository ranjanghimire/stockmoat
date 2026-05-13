import type { MoatAnalysis } from '../lib/computeMoatAnalysis'

const PILLAR_LABEL: Record<string, string> = {
  valuation: 'Valuation',
  quality: 'Quality',
  safety: 'Balance sheet',
  cash_truth: 'Cash truth',
  stability: 'Stability',
}

interface PillarBarsProps {
  analysis: MoatAnalysis
}

export function PillarBars({ analysis }: PillarBarsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {analysis.pillars.map((p) => {
        const ratio = p.weight > 0 ? Math.min(1, p.contribution / p.weight) : 0
        const pct = Math.round(ratio * 100)
        return (
          <div
            key={p.pillar}
            className="rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>{PILLAR_LABEL[p.pillar] ?? p.pillar}</span>
              <span className="text-moat-accent-dim">{pct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-moat-accent transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Pillar strength {(p.weight * 100).toFixed(0)}% of model weight
            </p>
          </div>
        )
      })}
    </div>
  )
}
