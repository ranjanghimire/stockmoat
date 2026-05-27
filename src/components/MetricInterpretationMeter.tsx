import type { MetricInterpretation, MetricSparkline } from '../lib/metricInterpretation/types'
import './MetricInterpretationMeter.css'

function verdictClass(verdict: string): string {
  return `metric-verdict metric-verdict--${verdict}`
}

function MetricSparklineBars({ sparkline }: { sparkline: MetricSparkline }) {
  const max = Math.max(...sparkline.values.map((v) => Math.abs(v)), 1e-9)
  return (
    <div className="metric-sparkline" aria-hidden>
      {sparkline.caption ? <p className="metric-sparkline__caption">{sparkline.caption}</p> : null}
      <div className="metric-sparkline__bars">
        {sparkline.values.map((v, i) => (
          <div
            key={i}
            className="metric-sparkline__bar"
            style={{ height: `${Math.max(8, (Math.abs(v) / max) * 100)}%` }}
            title={sparkline.labels?.[i] ?? String(v)}
          />
        ))}
      </div>
    </div>
  )
}

export function MetricTooltip({ text }: { text: string }) {
  return (
    <span className="metric-tooltip-wrap">
      <button
        type="button"
        className="metric-tooltip-btn"
        aria-label="What does this mean?"
        title={text}
      >
        ?
      </button>
    </span>
  )
}

interface MetricInterpretationMeterProps {
  interpretation: MetricInterpretation
  /** Optional title next to verdict (metric label). */
  title?: string
  showSparkline?: boolean
}

export function MetricInterpretationMeter({
  interpretation: i,
  title,
  showSparkline = true,
}: MetricInterpretationMeterProps) {
  const pct = Math.round(Math.min(100, Math.max(0, i.meterPosition * 100)))
  const unavailable = i.verdict === 'unavailable'
  const centerPct =
    i.meterCenterLabel && (i.meterKind === 'peer_lower_better' || i.meterKind === 'peer_higher_better')
      ? 50
      : undefined

  return (
    <div className="metric-interpretation-block">
      <div className="flex flex-wrap items-center gap-2">
        {title ? <span className="font-semibold text-moat-ink">{title}</span> : null}
        <span className={verdictClass(i.verdict)}>{i.verdictLabel}</span>
        <MetricTooltip text={i.tooltip} />
      </div>

      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-moat-ink">{i.formattedValue}</p>

      {(i.subjectFormatted || i.peerFormatted) && (
        <p className="mt-1 text-xs text-slate-600">
          {i.subjectFormatted ? <span>Yours: {i.subjectFormatted}</span> : null}
          {i.subjectFormatted && i.peerFormatted ? ' · ' : null}
          {i.peerFormatted ? <span>Peer median: {i.peerFormatted}</span> : null}
        </p>
      )}

      <div
        className={`metric-meter ${unavailable ? 'metric-meter--unavailable' : ''} ${i.meterKind === 'gate' ? 'metric-meter--gate' : ''}`}
        role="img"
        aria-label={`${i.verdictLabel} on scale from ${i.meterMinLabel} to ${i.meterMaxLabel}`}
      >
        <div className="metric-meter__labels">
          <span>{i.meterMinLabel}</span>
          {i.meterCenterLabel ? <span>{i.meterCenterLabel}</span> : <span aria-hidden />}
          <span>{i.meterMaxLabel}</span>
        </div>
        <div className="metric-meter__track">
          {centerPct !== undefined ? (
            <div className="metric-meter__center" style={{ left: `${centerPct}%` }} />
          ) : null}
          {!unavailable ? (
            <div className="metric-meter__needle" style={{ left: `${pct}%` }} />
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-700">{i.headline}</p>

      {showSparkline && i.sparkline && i.sparkline.values.length >= 2 ? (
        <MetricSparklineBars sparkline={i.sparkline} />
      ) : null}
    </div>
  )
}
