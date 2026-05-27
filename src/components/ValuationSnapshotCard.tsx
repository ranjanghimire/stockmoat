import type { ValuationSummary } from '../lib/metricInterpretation/types'
import { peBandForSector } from '../lib/metricInterpretation/registry'
import { MetricInterpretationMeter } from './MetricInterpretationMeter'

interface ValuationSnapshotCardProps {
  valuation: ValuationSummary
}

export function ValuationSnapshotCard({ valuation }: ValuationSnapshotCardProps) {
  if (valuation.lines.length === 0) return null

  const band = peBandForSector(valuation.sectorLabel)

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-md shadow-slate-900/5 backdrop-blur md:p-5">
      <h3 className="font-display text-lg text-moat-ink">Valuation snapshot</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Key multiples with a simple good-to-worry meter. P/E bands are rough sector guides
        {valuation.sectorLabel ? ` (${valuation.sectorLabel})` : ''} — not buy/sell advice.
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        Typical trailing P/E band for this sector: about {band.fairLow}×–{band.fairHigh}× (below ~{band.cheap}×
        often “cheap”, above ~{band.expensive}× often “expensive”).
      </p>

      <ul className="mt-5 grid gap-5 lg:grid-cols-2">
        {valuation.lines.map((line) => (
          <li key={line.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-4">
            <MetricInterpretationMeter
              interpretation={line.interpretation}
              title={line.label}
              showSparkline={false}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
