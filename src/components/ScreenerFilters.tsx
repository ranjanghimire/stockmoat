import { PILLAR_LABEL } from '../lib/pillarMeta'
import {
  activeScreenerFilterCount,
  type ScreenerFilters as ScreenerFiltersState,
} from '../lib/screen/screenerFilterTypes'
import { ScreenerFfv2MultipleChips } from './ScreenerFfv2MultipleChips'
import { ScreenerMarketCapSlider } from './ScreenerMarketCapSlider'
import { ScreenerMonotonicGrowthToggle } from './ScreenerMonotonicGrowthToggle'
import { ScreenerScoreSlider } from './ScreenerScoreSlider'
import './screenerFilters.css'

function formatProfileId(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export interface ScreenerFiltersProps {
  filters: ScreenerFiltersState
  onChange: (patch: Partial<ScreenerFiltersState>) => void
  onClear: () => void
  profileOptions: string[]
  sectorList: string[]
  hasEmptySector: boolean
}

export function ScreenerFilters({
  filters,
  onChange,
  onClear,
  profileOptions,
  sectorList,
  hasEmptySector,
}: ScreenerFiltersProps) {
  const activeCount = activeScreenerFilterCount(filters)

  return (
    <div className="screener-filters">
      <div className="screener-filters__row screener-filters__row--primary">
        <div className="screener-filters__select-wrap">
          <label htmlFor="screener-profile" className="screener-filters__select-label">
            Profile
          </label>
          <select
            id="screener-profile"
            value={filters.profile}
            onChange={(e) => onChange({ profile: e.target.value })}
            className="screener-filters__select"
          >
            <option value="">All profiles</option>
            {profileOptions.map((id) => (
              <option key={id} value={id}>
                {formatProfileId(id)}
              </option>
            ))}
          </select>
        </div>
        <div className="screener-filters__select-wrap">
          <label htmlFor="screener-sector" className="screener-filters__select-label">
            Sector
          </label>
          <select
            id="screener-sector"
            value={filters.sector}
            onChange={(e) => onChange({ sector: e.target.value })}
            className="screener-filters__select"
          >
            <option value="">All sectors</option>
            {sectorList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {hasEmptySector ? <option value="__none__">No sector</option> : null}
          </select>
        </div>
        <div className="screener-filters__actions">
          {activeCount > 0 ? (
            <>
              <span className="screener-filters__badge">
                {activeCount} filter{activeCount === 1 ? '' : 's'} active
              </span>
              <button type="button" className="screener-filters__clear" onClick={onClear}>
                Clear all
              </button>
            </>
          ) : null}
        </div>
      </div>

      <hr className="screener-filters__divider" />

      <div className="screener-filters__row screener-filters__row--scores">
        <ScreenerScoreSlider
          id="screener-vms"
          label="Value moat score"
          value={filters.minVms}
          onChange={(minVms) => onChange({ minVms })}
        />
        <ScreenerScoreSlider
          id="screener-valuation"
          label={PILLAR_LABEL.valuation ?? 'Valuation'}
          value={filters.minValuation}
          onChange={(minValuation) => onChange({ minValuation })}
        />
        <ScreenerScoreSlider
          id="screener-quality"
          label={PILLAR_LABEL.quality ?? 'Quality'}
          value={filters.minQuality}
          onChange={(minQuality) => onChange({ minQuality })}
        />
        <ScreenerScoreSlider
          id="screener-balance-sheet"
          label={PILLAR_LABEL.safety ?? 'Balance sheet'}
          value={filters.minBalanceSheet}
          onChange={(minBalanceSheet) => onChange({ minBalanceSheet })}
        />
        <ScreenerScoreSlider
          id="screener-cash-truth"
          label={PILLAR_LABEL.cash_truth ?? 'Cash truth'}
          value={filters.minCashTruth}
          onChange={(minCashTruth) => onChange({ minCashTruth })}
        />
        <ScreenerScoreSlider
          id="screener-stability"
          label={PILLAR_LABEL.stability ?? 'Stability'}
          value={filters.minStability}
          onChange={(minStability) => onChange({ minStability })}
        />
      </div>

      <hr className="screener-filters__divider" />

      <div className="screener-filters__row screener-filters__row--secondary">
        <ScreenerMarketCapSlider
          id="screener-market-cap"
          value={filters.minMarketCapUsd}
          onChange={(minMarketCapUsd) => onChange({ minMarketCapUsd })}
        />
        <ScreenerFfv2MultipleChips
          value={filters.ffv2MultipleMin}
          onChange={(ffv2MultipleMin) => onChange({ ffv2MultipleMin })}
        />
        <ScreenerMonotonicGrowthToggle
          id="screener-monotonic"
          checked={filters.forwardRevMonotonic}
          onChange={(forwardRevMonotonic) => onChange({ forwardRevMonotonic })}
        />
      </div>
    </div>
  )
}
