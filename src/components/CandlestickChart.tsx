import { useMemo } from 'react'
import type { OhlcvBar } from '../lib/yahoo/weeklyChartTypes'

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
  return { bars, toY, slot }
}

export function CandlestickChart({ bars }: { bars: OhlcvBar[] }) {
  const layout = useMemo(() => layoutBars(bars), [bars])

  if (!layout) return null

  const { bars: rowBars, toY, slot } = layout

  return (
    <svg
      className="h-[13.333rem] w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-hidden
    >
      {rowBars.map((bar, i) => {
        const cx = (i + 0.5) * slot
        const half = Math.max(slot * 0.32, 0.4)
        const up = bar.c >= bar.o
        const bodyTop = toY(Math.max(bar.o, bar.c))
        const bodyBot = toY(Math.min(bar.o, bar.c))
        // With many narrow slots, enforce a minimum body in viewBox units so doji / near-flat days stay visible.
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
  )
}
