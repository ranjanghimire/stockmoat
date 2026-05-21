import { fmpGet } from './http'

type JsonRecord = Record<string, unknown>

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/** Calendar date in UTC (YYYY-MM-DD) for comparisons with FMP `date` fields. */
export function utcCalendarDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function extractDateFromRow(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const o = row as JsonRecord
  const candidates = [o.date, o.earningsDate, o.earningDate]
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const t = c.trim()
    if (!t) continue
    const ymd = t.length >= 10 ? t.slice(0, 10) : t
    if (isYmd(ymd)) return ymd
  }
  return null
}

/**
 * From `/stable/earnings?symbol=…` rows, pick the earliest announcement on or after `onOrAfterYmd` (inclusive).
 */
export function pickNextEarningsOnOrAfter(rows: unknown[], onOrAfterYmd: string): string | null {
  const dates: string[] = []
  for (const r of rows) {
    const y = extractDateFromRow(r)
    if (y) dates.push(y)
  }
  const future = dates.filter((d) => d >= onOrAfterYmd)
  if (future.length === 0) return null
  future.sort()
  return future[0] ?? null
}

export async function fetchFmpNextEarningsDate(
  symbol: string,
  apiKey: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<{ nextDate: string | null }> {
  const sym = symbol.trim().toUpperCase()
  const q = encodeURIComponent(sym)
  const limit = Math.max(5, Math.min(opts?.limit ?? 40, 200))
  const rows = await fmpGet<unknown>(`/stable/earnings?symbol=${q}&limit=${limit}`, apiKey, {
    signal: opts?.signal,
  })
  const list = Array.isArray(rows) ? rows : []
  const today = utcCalendarDateString()
  return { nextDate: pickNextEarningsOnOrAfter(list, today) }
}

export function formatNextEarningsDisplay(ymd: string): string {
  try {
    const d = new Date(`${ymd}T12:00:00.000Z`)
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(d)
  } catch {
    return ymd
  }
}
