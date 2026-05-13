import { useMemo } from 'react'
import type { OhlcvBar } from '../lib/yahoo/weeklyChartTypes'

/** Matches chart SVG height (10rem × 4/3). */
const CHART_H_CLASS = 'h-[13.333rem]'

const Y_TICKS = 5

function layoutBars(bars: OhlcvBar[]) {
  if (bars.length === 0) return null
  const highs = bars.map((b) => b.h)
  const lows = bars.map((b) => b.l)
  let yMin = Math.min(...lows)
  let yMax = Math.max(...highs)
  if (yMax <= yMin) {
    yMin -= 1e-6
    yMax += 1e-6
  }
  const span = yMax - yMin
  const n = bars.length
  const slot = 100 / n
  const toY = (p: number) => 100 - ((p - yMin) / span) * 100
  return { bars, toY, slot, yMin, yMax, span }
}

function buildYTicks(yMin: number, yMax: number, count: number): number[] {
  if (count < 2) return [yMin, yMax]
  const span = yMax - yMin
  return Array.from({ length: count }, (_, i) => yMax - (span * i) / (count - 1))
}

function formatAxisPrice(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: Math.abs(n) >= 1_000_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(n)
  } catch {
    const sign = n < 0 ? '-' : ''
    return `${sign}$${Math.abs(n).toFixed(2)}`
  }
}

export function CandlestickChart({ bars, currency = 'USD' }: { bars: OhlcvBar[]; currency?: string }) {
  const layout = useMemo(() => layoutBars(bars), [bars])

  if (!layout) return null

  const { bars: rowBars, toY, slot, yMin, yMax } = layout
  const yTicks = buildYTicks(yMin, yMax, Y_TICKS)

  return (
    <div
      className="flex items-stretch gap-1.5"
      role="img"
      aria-label={`Price range about ${formatAxisPrice(yMax, currency)} to ${formatAxisPrice(yMin, currency)}`}
    >
      <div
        className={`flex ${CHART_H_CLASS} w-12 shrink-0 flex-col justify-between py-0.5 text-right font-mono text-[10px] leading-none text-slate-500 tabular-nums sm:w-14`}
      >
        {yTicks.map((v) => (
          <span key={v} className="block">
            {formatAxisPrice(v, currency)}
          </span>
        ))}
      </div>
      <div className={`relative min-w-0 flex-1 ${CHART_H_CLASS}`}>
        <svg
          className="h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <g className="stroke-slate-200/70">
            {yTicks.map((price) => {
              const y = toY(price)
              return (
                <line
                  key={`grid-${price}`}
                  x1={0}
                  x2={100}
                  y1={y}
                  y2={y}
                  strokeWidth={0.35}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </g>
          {rowBars.map((bar, i) => {
            const cx = (i + 0.5) * slot
            const half = Math.max(slot * 0.32, 0.4)
            const up = bar.c >= bar.o
            const bodyTop = toY(Math.max(bar.o, bar.c))
            const bodyBot = toY(Math.min(bar.o, bar.c))
            const bodyH = Math.max(bodyBot - bodyTop, slot * 0.42, 0.85)
            const midY = (bodyTop + bodyBot) / 2
            const wickTop = toY(bar.h)
            const wickBot = toY(bar.l)
            const chartTop = Math.min(wickTop, wickBot)
            const chartBot = Math.max(wickTop, wickBot)
            let y0 = midY - bodyH / 2
            let y1 = midY + bodyH / 2
            y0 = Math.max(y0, chartTop)
            y1 = Math.min(y1, chartBot)
            if (y1 - y0 < 0.2) y1 = y0 + 0.2
            const drawH = y1 - y0
            return (
              <g key={bar.t}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={wickTop}
                  y2={wickBot}
                  className={up ? 'stroke-emerald-800' : 'stroke-rose-800'}
                  strokeWidth={0.9}
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={cx - half}
                  y={y0}
                  width={half * 2}
                  height={drawH}
                  className={up ? 'fill-emerald-500' : 'fill-rose-500'}
                />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
