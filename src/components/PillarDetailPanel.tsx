import { useState } from 'react'
import type { MetricRow, MoatAnalysis } from '../lib/computeMoatAnalysis'
import type { MoatFundamentalsSnapshot } from '../lib/moatFundamentalsSnapshot'
import { PILLAR_INTRO, PILLAR_LABEL } from '../lib/pillarMeta'
import { MetricInterpretationMeter } from './MetricInterpretationMeter'

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
  const label = mode === 'gate' ? 'Must pass' : mode === 'hybrid' ? 'Threshold + grade' : 'Graded'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles}`}>
      {label}
    </span>
  )
}

function fmtUsd(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

function fmtRatio(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toFixed(2)}×`
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(2)}%`
}

function CashTruthFigures({ f }: { f: MoatFundamentalsSnapshot }) {
  const hasAny = [
    f.revenueTtmUsd,
    f.netIncomeTtmUsd,
    f.operatingCashFlowTtmUsd,
    f.freeCashFlowTtmUsd,
    f.capexTtmUsd,
    f.cashAndEquivalentsUsd,
    f.totalDebtUsd,
  ].some((x) => x !== undefined && Number.isFinite(x))

  if (!hasAny) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Underlying cash & earnings (TTM)</p>
        <p className="mt-1 text-xs leading-relaxed">
          FMP did not return usable TTM statement totals for revenue, net income, or cash flows on this pack. The
          metrics below still use ratios from key-metrics / ratios when those exist.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200/90 bg-slate-50/80 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Underlying figures (FMP TTM / latest)</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-slate-500">Revenue (TTM)</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtUsd(f.revenueTtmUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Net income (TTM)</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtUsd(f.netIncomeTtmUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Operating cash flow (TTM)</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtUsd(f.operatingCashFlowTtmUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Free cash flow (TTM)</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtUsd(f.freeCashFlowTtmUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Capex (TTM)</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtUsd(f.capexTtmUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Cash & equivalents</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtUsd(f.cashAndEquivalentsUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Total debt</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtUsd(f.totalDebtUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">OCF / net income</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtRatio(f.ocfToNetIncome)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">FCF yield (TTM)</dt>
          <dd className="mt-0.5 font-mono text-moat-ink">{fmtPct(f.fcfYield)}</dd>
        </div>
      </dl>
    </div>
  )
}

function MetricAdvancedDetails({ m }: { m: MetricRow }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-600 hover:text-moat-ink"
        aria-expanded={open}
      >
        How this affects your score
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3 text-sm text-slate-600">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Weight in model</dt>
              <dd>{(m.pillar_weight * 100).toFixed(2)}% of total scorecard</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Contribution</dt>
              <dd className="font-mono">{m.weightedContribution.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rubric score</dt>
              <dd>
                {m.mode === 'gate' ? (
                  m.gatePass ? (
                    <span className="text-emerald-700">Pass</span>
                  ) : (
                    <span className="text-rose-700">Fail</span>
                  )
                ) : (
                  <span>{(m.subscore * 100).toFixed(0)}% on this line</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Raw reading</dt>
              <dd className="text-xs">{m.displayValue}</dd>
            </div>
          </dl>
          {m.peerNote ? (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold text-moat-ink">Peers: </span>
              {m.peerNote}
            </p>
          ) : null}
          {m.breakdown?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What we checked</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                {m.breakdown.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-[11px] italic text-slate-400">
            Meters show favorability under this sector profile, not investment advice.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function PillarDetailPanel({ analysis, pillar, onClose }: PillarDetailPanelProps) {
  if (!pillar) return null

  const title = PILLAR_LABEL[pillar] ?? pillar.replace(/_/g, ' ')
  const intro = PILLAR_INTRO[pillar] ?? 'Metrics in this pillar from the active sector profile.'
  const rollup = analysis.pillars.find((p) => p.pillar === pillar)
  const rows = analysis.metrics.filter((m) => m.pillar === pillar)
  const ratio = rollup && rollup.weight > 0 ? Math.min(1, rollup.contribution / rollup.weight) : 0
  const strengthPct = Math.round(ratio * 100)
  const pillarScore =
    rollup && typeof rollup.pillarScore === 'number' && Number.isFinite(rollup.pillarScore)
      ? rollup.pillarScore
      : Math.round((1 + 9 * ratio) * 10) / 10
  const fund = analysis.fundamentals

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
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div className="rounded-xl border border-moat-accent/30 bg-white/90 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pillar score</p>
                <p className="mt-1 font-display text-3xl leading-none text-moat-ink">
                  {pillarScore}
                  <span className="ml-1 text-base font-sans font-medium text-slate-400">/ 10</span>
                </p>
              </div>
              <p className="max-w-md text-xs text-slate-500">
                This pillar is {(rollup.weight * 100).toFixed(1)}% of your total score · strength {strengthPct}%
              </p>
            </div>
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

      {pillar === 'cash_truth' && fund ? <CashTruthFigures f={fund} /> : null}

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No metrics mapped to this pillar for the current profile.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((m) => (
            <li key={m.id} className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-moat-ink">{m.label}</h3>
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

              {m.interpretation ? (
                <div className="mt-4">
                  <MetricInterpretationMeter interpretation={m.interpretation} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-700">{m.displayValue}</p>
              )}

              <MetricAdvancedDetails m={m} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
