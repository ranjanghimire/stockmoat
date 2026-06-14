import { MARKET_CAP_STEPS } from '../lib/screen/screenerFilterTypes'
import './screenerMarketCapSlider.css'

function stepIndexForValue(value: number | null): number {
  const idx = MARKET_CAP_STEPS.findIndex((s) => s.value === value)
  return idx >= 0 ? idx : 0
}

export interface ScreenerMarketCapSliderProps {
  id: string
  value: number | null
  onChange: (value: number | null) => void
}

export function ScreenerMarketCapSlider({ id, value, onChange }: ScreenerMarketCapSliderProps) {
  const index = stepIndexForValue(value)
  const label = MARKET_CAP_STEPS[index]?.label ?? 'Any'

  return (
    <div className="screener-market-cap-slider">
      <div className="screener-market-cap-slider__header">
        <label htmlFor={id} className="screener-market-cap-slider__label">
          Market cap
        </label>
        <span
          className={`screener-market-cap-slider__value${value == null ? ' screener-market-cap-slider__value--any' : ''}`}
          aria-live="polite"
        >
          {label}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="screener-market-cap-slider__input"
        min={0}
        max={MARKET_CAP_STEPS.length - 1}
        step={1}
        value={index}
        onChange={(e) => {
          const step = MARKET_CAP_STEPS[Number(e.target.value)]
          onChange(step?.value ?? null)
        }}
        aria-valuetext={label}
      />
      <div className="screener-market-cap-slider__ticks">
        {MARKET_CAP_STEPS.map((s) => (
          <span key={s.label}>{s.label.replace('+', '')}</span>
        ))}
      </div>
    </div>
  )
}
