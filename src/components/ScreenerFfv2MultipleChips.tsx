import type { Ffv2MultipleFilter } from '../lib/screen/screenerFilterTypes'
import './screenerFfv2MultipleChips.css'

const OPTIONS: Array<{ label: string; value: Ffv2MultipleFilter }> = [
  { label: 'Any', value: null },
  { label: '2×', value: 2 },
  { label: '3×', value: 3 },
]

export interface ScreenerFfv2MultipleChipsProps {
  value: Ffv2MultipleFilter
  onChange: (value: Ffv2MultipleFilter) => void
}

export function ScreenerFfv2MultipleChips({ value, onChange }: ScreenerFfv2MultipleChipsProps) {
  return (
    <div className="screener-ffv2-chips">
      <span className="screener-ffv2-chips__label">Future fair value</span>
      <p className="screener-ffv2-chips__hint">FFV₂ (≈2 years) vs today&apos;s price</p>
      <div className="screener-ffv2-chips__group" role="group" aria-label="Future fair value multiple filter">
        {OPTIONS.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.label}
              type="button"
              className={`screener-ffv2-chips__chip${active ? ' screener-ffv2-chips__chip--active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
