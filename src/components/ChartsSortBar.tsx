import {
  CHARTS_SORT_LABELS,
  type ChartsSortColumn,
  type ChartsSortState,
} from '../lib/screen/chartsSortTypes'
import './chartsSortBar.css'

const SORT_COLUMNS: ChartsSortColumn[] = ['score', 'forward_growth_score', 'next_earnings_date']

export interface ChartsSortBarProps {
  sort: ChartsSortState
  onChange: (sort: ChartsSortState) => void
}

export function ChartsSortBar({ sort, onChange }: ChartsSortBarProps) {
  return (
    <div className="charts-sort-bar" role="group" aria-label="Chart gallery sort">
      <div className="charts-sort-bar__field">
        <label htmlFor="charts-sort-column" className="charts-sort-bar__label">
          Sort by
        </label>
        <select
          id="charts-sort-column"
          className="charts-sort-bar__select"
          value={sort.column}
          onChange={(e) => onChange({ ...sort, column: e.target.value as ChartsSortColumn })}
        >
          {SORT_COLUMNS.map((col) => (
            <option key={col} value={col}>
              {CHARTS_SORT_LABELS[col]}
            </option>
          ))}
        </select>
      </div>
      <div className="charts-sort-bar__field">
        <label htmlFor="charts-sort-order" className="charts-sort-bar__label">
          Order
        </label>
        <select
          id="charts-sort-order"
          className="charts-sort-bar__select"
          value={sort.ascending ? 'asc' : 'desc'}
          onChange={(e) => onChange({ ...sort, ascending: e.target.value === 'asc' })}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
    </div>
  )
}
