import {
  screenerFilterClauses,
  type ScreenerFilters,
} from './screenerFilterTypes'

type FilterableQuery = {
  eq: (column: string, value: string | boolean) => FilterableQuery
  gte: (column: string, value: number) => FilterableQuery
  not: (column: string, operator: string, value: null) => FilterableQuery
  or: (expression: string) => FilterableQuery
}

export function applyScreenerFilters(q: FilterableQuery, filters: ScreenerFilters): FilterableQuery {
  let next = q
  for (const clause of screenerFilterClauses(filters)) {
    switch (clause.type) {
      case 'eq':
        next = next.eq(clause.column, clause.value)
        break
      case 'gte':
        next = next.gte(clause.column, clause.value)
        break
      case 'not_null':
        next = next.not(clause.column, 'is', null)
        break
      case 'or':
        next = next.or(clause.expression)
        break
      default:
        break
    }
  }
  return next
}
