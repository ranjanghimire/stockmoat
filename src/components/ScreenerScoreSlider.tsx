import './screenerScoreSlider.css'

const MIN_SCORE = 1
const MAX_SCORE = 10
const STEP = 0.5

/** Index 0 = Any; indices 1..N map to scores 1..10 in 0.5 steps. */
const SCORE_STEPS: Array<number | null> = [null]
for (let s = MIN_SCORE; s <= MAX_SCORE + 1e-9; s += STEP) {
  SCORE_STEPS.push(Math.round(s * 10) / 10)
}

function scoreToIndex(value: number | null): number {
  if (value == null) return 0
  const idx = SCORE_STEPS.findIndex((s) => s === value)
  return idx >= 0 ? idx : 0
}

function indexToScore(index: number): number | null {
  return SCORE_STEPS[Math.max(0, Math.min(index, SCORE_STEPS.length - 1))] ?? null
}

export interface ScreenerScoreSliderProps {
  id: string
  label: string
  value: number | null
  onChange: (value: number | null) => void
}

export function ScreenerScoreSlider({ id, label, value, onChange }: ScreenerScoreSliderProps) {
  const index = scoreToIndex(value)
  const display = value == null ? 'Any' : `≥ ${value.toFixed(1)}`

  return (
    <div className="screener-score-slider">
      <div className="screener-score-slider__header">
        <label htmlFor={id} className="screener-score-slider__label">
          {label}
        </label>
        <span
          className={`screener-score-slider__value${value == null ? ' screener-score-slider__value--any' : ''}`}
          aria-live="polite"
        >
          {display}
        </span>
      </div>
      <div className="screener-score-slider__track-wrap">
        <input
          id={id}
          type="range"
          className="screener-score-slider__input"
          min={0}
          max={SCORE_STEPS.length - 1}
          step={1}
          value={index}
          onChange={(e) => onChange(indexToScore(Number(e.target.value)))}
          aria-valuetext={display}
        />
      </div>
      <div className="screener-score-slider__ticks">
        <span>Any</span>
        <span>10</span>
      </div>
    </div>
  )
}
