import type { MoatAnalysis } from '../lib/computeMoatAnalysis'

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

export function MetricTable({ analysis }: MetricTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3">
        <h3 className="font-display text-xl text-moat-ink">Metric breakdown</h3>
        <p className="text-xs text-slate-500">Weights from `config/sector_profiles.v1.yaml` (normalized to sum to 1).</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50/90 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Metric</th>
              <th className="px-4 py-3 font-semibold">Pillar</th>
              <th className="px-4 py-3 font-semibold">Mode</th>
              <th className="px-4 py-3 font-semibold">Weight</th>
              <th className="px-4 py-3 font-semibold">Value</th>
              <th className="px-4 py-3 font-semibold">Subscore</th>
              <th className="px-4 py-3 font-semibold">Gate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {analysis.metrics.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-moat-ink">{m.label}</div>
                  <div className="text-[11px] text-slate-400">{m.id}</div>
                  {m.peerNote ? <div className="mt-1 text-[11px] text-slate-500">{m.peerNote}</div> : null}
                </td>
                <td className="px-4 py-3 capitalize text-slate-600">{m.pillar.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <ModeBadge mode={m.mode} />
                </td>
                <td className="px-4 py-3 text-slate-700">{(m.pillar_weight * 100).toFixed(1)}%</td>
                <td className="px-4 py-3 text-slate-800">{m.displayValue}</td>
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
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
