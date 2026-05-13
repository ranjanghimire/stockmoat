import { useMemo } from 'react'
import type { MoatAnalysis, MetricRow } from '../lib/computeMoatAnalysis'
import { PILLAR_LABEL, sortPillarIds } from '../lib/pillarMeta'

interface MetricTableProps {
  analysis: MoatAnalysis
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

function pillarLabel(pillar: string): string {
  return PILLAR_LABEL[pillar] ?? pillar.replace(/_/g, ' ')
}

export function MetricTable({ analysis }: MetricTableProps) {
  const { pillarOrder, byPillar } = useMemo(() => {
    const order: string[] = []
    const seen = new Set<string>()
    const map = new Map<string, MetricRow[]>()

    for (const row of analysis.metrics) {
      if (!seen.has(row.pillar)) {
        seen.add(row.pillar)
        order.push(row.pillar)
      }
      const list = map.get(row.pillar) ?? []
      list.push(row)
      map.set(row.pillar, list)
    }

    return { pillarOrder: sortPillarIds(order), byPillar: map }
  }, [analysis.metrics])

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3">
        <h3 className="font-display text-xl text-moat-ink">Metric breakdown</h3>
        <p className="text-xs text-slate-500">
          Weights from `config/sector_profiles.v1.yaml` (normalized to sum to 1). Contribution is weight × subscore
          (or gate credit for gates).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50/90 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Metric</th>
              <th className="px-4 py-3 font-semibold">Mode</th>
              <th className="px-4 py-3 font-semibold">Weight</th>
              <th className="px-4 py-3 font-semibold">Contrib.</th>
              <th className="px-4 py-3 font-semibold">Value</th>
              <th className="px-4 py-3 font-semibold">Subscore</th>
              <th className="px-4 py-3 font-semibold">Gate</th>
              <th className="min-w-[200px] px-4 py-3 font-semibold">How it&apos;s computed</th>
            </tr>
          </thead>
          {pillarOrder.map((pillar) => (
            <tbody key={pillar} className="divide-y divide-slate-100">
              <tr className="bg-slate-100/90">
                <td colSpan={8} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  {pillarLabel(pillar)}
                </td>
              </tr>
              {(byPillar.get(pillar) ?? []).map((m) => (
                <tr key={m.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-moat-ink">{m.label}</div>
                    <div className="text-[11px] text-slate-400">{m.id}</div>
                    {m.peerNote ? <div className="mt-1 text-[11px] text-slate-500">{m.peerNote}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <ModeBadge mode={m.mode} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{(m.pillar_weight * 100).toFixed(1)}%</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                    {m.weightedContribution.toFixed(4)}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-slate-800">{m.displayValue}</td>
                  <td className="px-4 py-3 text-slate-800">{(m.subscore * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    {m.mode === 'gate' ? (
                      <span className={m.gatePass ? 'text-emerald-700' : 'text-rose-700'}>
                        {m.gatePass ? 'Pass' : 'Fail'}
                        {m.gatePass && m.gateCredit !== undefined && m.gateCredit < 1 ? (
                          <span className="block text-[10px] font-normal text-slate-500">
                            credit {(m.gateCredit * 100).toFixed(0)}%
                          </span>
                        ) : null}
                      </span>
                    ) : m.mode === 'hybrid' ? (
                      <span className={m.gatePass ? 'text-emerald-700' : 'text-rose-700'}>
                        {m.gatePass ? 'Pass' : 'Fail'}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] leading-snug text-slate-600">
                    {m.breakdown?.length ? (
                      <ul className="list-disc space-y-1 pl-4">
                        {m.breakdown.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}
