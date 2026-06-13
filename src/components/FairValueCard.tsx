import { useState } from 'react'
import type { FairValueSnapshot } from '../lib/fairValue/types'
import './fairValueCard.css'

interface FairValueCardProps {
  fairValue: FairValueSnapshot
  marketPrice?: number
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(1)}%`
}

function subProfileLabel(id: string): string {
  const labels: Record<string, string> = {
    profitable_saas: 'Profitable SaaS',
    growth_saas: 'Growth SaaS',
    transitional_saas: 'Transitional SaaS',
    semis_mid_cycle: 'Mid-cycle semis',
    semis_peak_cycle: 'Peak cycle (normalized)',
    semis_trough_cycle: 'Trough cycle (normalized)',
    cyclical_mid: 'Mid-cycle',
    cyclical_peak: 'Peak cycle (normalized)',
    cyclical_trough: 'Trough cycle (normalized)',
    standard: 'Standard valuation',
  }
  return labels[id] ?? id
}

function confidenceLabel(c: FairValueSnapshot['confidence']): string {
  return c.charAt(0).toUpperCase() + c.slice(1)
}

export function FairValueCard({ fairValue, marketPrice }: FairValueCardProps) {
  const [methodsOpen, setMethodsOpen] = useState(false)
  const price = marketPrice ?? fairValue.marketPrice
  const cfv = fairValue.cfv.base
  const upside = fairValue.upsideToCfvPct
  const upsideClass =
    upside === undefined ? '' : upside >= 0 ? 'fair-value-badge--undervalued' : 'fair-value-badge--overvalued'

  return (
    <section className="fair-value-card rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-md shadow-slate-900/5 backdrop-blur md:p-5">
      <div className="fair-value-card__header">
        <div>
          <h3 className="font-display text-lg text-moat-ink">Fair value estimate</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Triangulated from peer multiples and quality adjustment — methodology varies by sector profile. Not
            buy/sell advice.
          </p>
        </div>
        <span className={`fair-value-confidence fair-value-confidence--${fairValue.confidence}`}>
          {confidenceLabel(fairValue.confidence)} confidence
        </span>
      </div>

      <div className="fair-value-card__hero">
        <div className="fair-value-stat">
          <span className="fair-value-stat__label">Current fair value</span>
          <span className="fair-value-stat__value">{fmtUsd(cfv)}</span>
          <span className="fair-value-stat__range">
            Range {fmtUsd(fairValue.cfv.low)} – {fmtUsd(fairValue.cfv.high)}
          </span>
        </div>
        {price !== undefined && Number.isFinite(price) ? (
          <div className="fair-value-stat">
            <span className="fair-value-stat__label">Market price</span>
            <span className="fair-value-stat__value">{fmtUsd(price)}</span>
            {upside !== undefined ? (
              <span className={`fair-value-badge ${upsideClass}`}>{fmtPct(upside)} vs fair value</span>
            ) : null}
          </div>
        ) : null}
        {fairValue.ffv2 ? (
          <div className="fair-value-stat">
            <span className="fair-value-stat__label">Fair value in ~2 years</span>
            <span className="fair-value-stat__value">{fmtUsd(fairValue.ffv2.base)}</span>
            <span className="fair-value-stat__range">
              {fmtPct(fairValue.upsideToFfv2Pct)} from today
              {fairValue.cagrToFfv2 !== undefined
                ? ` · ${fmtPct(fairValue.cagrToFfv2)} CAGR`
                : null}
            </span>
          </div>
        ) : null}
      </div>

      <div className="fair-value-card__meta">
        <span className="fair-value-pill">{subProfileLabel(fairValue.subProfileId)}</span>
        <span className="fair-value-meta-text">
          Quality adjustment {fairValue.qualityMultiplier.toFixed(2)}× on fair multiples
        </span>
      </div>

      {fairValue.warnings.length > 0 ? (
        <ul className="fair-value-warnings">
          {fairValue.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        className="fair-value-methods-toggle"
        onClick={() => setMethodsOpen((o) => !o)}
        aria-expanded={methodsOpen}
      >
        {methodsOpen ? 'Hide method breakdown' : 'Show method breakdown'}
      </button>

      {methodsOpen ? (
        <table className="fair-value-methods-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>CFV</th>
              <th>FFV₂</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {fairValue.methods
              .filter((m) => m.status === 'ok' || m.status === 'fallback')
              .map((m) => (
                <tr key={m.methodId}>
                  <td>{m.methodId.replace(/_/g, ' ')}</td>
                  <td>{m.cfvPerShare !== undefined ? fmtUsd(m.cfvPerShare) : '—'}</td>
                  <td>{m.ffv2PerShare !== undefined ? fmtUsd(m.ffv2PerShare) : '—'}</td>
                  <td>{(m.effectiveWeight * 100).toFixed(0)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}
