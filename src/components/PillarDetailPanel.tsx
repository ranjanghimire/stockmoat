import type { MetricRow, MoatAnalysis } from '../lib/computeMoatAnalysis'
import { PILLAR_INTRO, PILLAR_LABEL } from '../lib/pillarMeta'

interface PillarDetailPanelProps {
  analysis: MoatAnalysis
  pillar: string | null
  onClose: () => void
}

function ModeBadge({ mode }: { mode: string }) {
  const styles =
    mode === 'gate'
      ? 'bg-rose-100 text-rose-900'
      : mode === 'hybrid'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-emerald-100 text-emerald-900'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles}`}>
      {mode}
    </span>
  )
}

function scoreRationale(m: MetricRow): string {
  if (m.mode === 'gate') {
    if (!m.gatePass) {
      return 'This line is a gate: it failed, so it adds nothing to the weighted sum and can trigger an overall score cap per sector YAML.'
    }
    const c = m.gateCredit ?? 1
    if (c < 1) {
      return `Gate passed with reduced credit (${(c * 100).toFixed(0)}%): the pillar only receives part of this line’s weight toward the total.`
    }
    return 'Gate passed: this line contributes its full pillar weight toward the weighted sum.'
  }
  if (m.mode === 'hybrid') {
    if (!m.gatePass) {
      return 'Hybrid metric: the threshold leg did not clear, so the model treats this as a weak outcome for the pillar.'
    }
    return `Hybrid metric: threshold cleared; graded subscore ${(m.subscore * 100).toFixed(0)}% is applied to this line’s pillar weight.`
  }
  return `Score metric: subscore ${(m.subscore * 100).toFixed(0)}% reflects how favorable this reading is versus peers or history (see bullets below).`
}

export function PillarDetailPanel({ analysis, pillar, onClose }: PillarDetailPanelProps) {
  if (!pillar) return null

  const title = PILLAR_LABEL[pillar] ?? pillar.replace(/_/g, ' ')
  const intro = PILLAR_INTRO[pillar] ?? 'Metrics in this pillar from the active sector profile.'
  const rollup = analysis.pillars.find((p) => p.pillar === pillar)
  const rows = analysis.metrics.filter((m) => m.pillar === pillar)
  const ratio = rollup && rollup.weight > 0 ? Math.min(1, rollup.contribution / rollup.weight) : 0
  const strengthPct = Math.round(ratio * 100)

  return (
    <section
      className="rounded-2xl border border-moat-accent/25 bg-gradient-to-b from-emerald-50/40 to-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur"
      aria-labelledby="pillar-detail-heading"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-moat-accent-dim">Pillar drill-down</p>
          <h2 id="pillar-detail-heading" className="mt-1 font-display text-2xl text-moat-ink">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{intro}</p>
          {rollup ? (
            <p className="mt-2 text-xs text-slate-500">
              This pillar uses <span className="font-semibold text-moat-ink">{(rollup.weight * 100).toFixed(1)}%</span>{' '}
              of total model weight. Realized strength vs that budget:{' '}
              <span className="font-semibold text-moat-ink">{strengthPct}%</span> (contribution ÷ pillar weight).
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No metrics mapped to this pillar for the current profile.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-moat-ink">{m.label}</h3>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">{m.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ModeBadge mode={m.mode} />
                  {m.peer_relative ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      vs peers
                    </span>
                  ) : null}
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observed value</dt>
                  <dd className="mt-1 text-moat-ink">{m.displayValue}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Model line weight</dt>
                  <dd className="mt-1 text-moat-ink">{(m.pillar_weight * 100).toFixed(2)}% of total scorecard</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contribution</dt>
                  <dd className="mt-1 font-mono text-moat-ink">{m.weightedContribution.toFixed(4)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscore / gate</dt>
                  <dd className="mt-1 text-moat-ink">
                    {m.mode === 'gate' ? (
                      <>
                        {m.gatePass ? (
                          <span className="text-emerald-700">Pass</span>
                        ) : (
                          <span className="text-rose-700">Fail</span>
                        )}
                        {m.gatePass && m.gateCredit !== undefined && m.gateCredit < 1 ? (
                          <span className="text-slate-600"> · credit {(m.gateCredit * 100).toFixed(0)}%</span>
                        ) : null}
                      </>
                    ) : m.mode === 'hybrid' ? (
                      <>
                        <span className={m.gatePass ? 'text-emerald-700' : 'text-rose-700'}>
                          {m.gatePass ? 'Threshold pass' : 'Threshold fail'}
                        </span>
                        <span className="text-slate-600"> · subscore {(m.subscore * 100).toFixed(0)}%</span>
                      </>
                    ) : (
                      <span>{(m.subscore * 100).toFixed(0)}%</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-lg bg-slate-50/90 px-3 py-2 text-sm leading-relaxed text-slate-700">
                <span className="font-semibold text-moat-ink">Why this line scored this way: </span>
                {scoreRationale(m)}
              </div>

              {m.peerNote ? (
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-moat-ink">Peer context: </span>
                  {m.peerNote}
                </p>
              ) : null}

              {m.breakdown?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What was checked</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
                    {m.breakdown.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-xs italic text-slate-400">No extra rubric notes from the evaluator for this line.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
