export type JsonRecord = Record<string, unknown>

export function firstRow<T extends JsonRecord>(rows: unknown): T | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined
  return rows[0] as T
}

/** Stable API may return a single object instead of a one-element array. */
export function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data !== null && data !== undefined && typeof data === 'object') return [data as T]
  return []
}

export function num(...vals: Array<unknown>): number | undefined {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

export function median(values: number[]): number | undefined {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (xs.length === 0) return undefined
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1]! + xs[mid]!) / 2
}
