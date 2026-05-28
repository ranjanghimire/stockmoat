export type ScreenerSortableColumn =
  | 'score'
  | 'forward_growth_score'
  | 'symbol'
  | 'display_name'
  | 'next_earnings_date'
  | 'updated_at'

type Props = {
  label: string
  column: ScreenerSortableColumn
  activeColumn: ScreenerSortableColumn | null
  ascending: boolean
  onSort: (column: ScreenerSortableColumn) => void
  className?: string
}

export function ScreenerSortableHeader({ label, column, activeColumn, ascending, onSort, className }: Props) {
  const active = activeColumn === column
  const direction = active ? (ascending ? 'asc' : 'desc') : 'none'

  return (
    <th className={`screener-table__th ${className ?? ''}`.trim()}>
      <button
        type="button"
        className={`screener-table__th-sort${active ? ' screener-table__th-sort--active' : ''}`}
        onClick={() => onSort(column)}
        aria-sort={direction === 'none' ? 'none' : direction === 'asc' ? 'ascending' : 'descending'}
      >
        <span>{label}</span>
        <span className="screener-table__sort-icons" aria-hidden>
          <span
            className={`screener-table__sort-chevron screener-table__sort-chevron--up${active && ascending ? ' screener-table__sort-chevron--lit' : ''}`}
          />
          <span
            className={`screener-table__sort-chevron screener-table__sort-chevron--down${active && !ascending ? ' screener-table__sort-chevron--lit' : ''}`}
          />
        </span>
      </button>
    </th>
  )
}
