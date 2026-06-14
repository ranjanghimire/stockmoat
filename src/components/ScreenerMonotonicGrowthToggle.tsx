import './screenerMonotonicGrowthToggle.css'

export interface ScreenerMonotonicGrowthToggleProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function ScreenerMonotonicGrowthToggle({ id, checked, onChange }: ScreenerMonotonicGrowthToggleProps) {
  return (
    <label
      htmlFor={id}
      className={`screener-monotonic-toggle${checked ? ' screener-monotonic-toggle--checked' : ''}`}
    >
      <input
        id={id}
        type="checkbox"
        className="screener-monotonic-toggle__input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="screener-monotonic-toggle__text">
        <span className="screener-monotonic-toggle__label">Rising consensus revenue (3 years)</span>
        <span className="screener-monotonic-toggle__hint">Each forward estimate year higher than the previous</span>
      </span>
    </label>
  )
}
