import { fmpGet } from './http'
import { fmpPayloadHasErrorMessage } from './profileClassification'
import type { OhlcvBar, PriceChartsPayload } from '../yahoo/weeklyChartTypes'

type JsonRecord = Record<string, unknown>

/** Enough calendar history for ~2y weekly + ~6mo daily (plus ISO-week edge buffer). */
const LOOKBACK_DAYS = 800
const MS_2Y = 731 * 86_400_000
const MS_6M = 186 * 86_400_000

function asArray(data: unknown): JsonRecord[] {
  return Array.isArray(data) ? (data as JsonRecord[]) : []
}

function pickNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '' || t === 'null') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function ymdFromUtcMs(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

/** ISO week key (UTC) for bucketing daily rows into one candle per week. */
function isoWeekKeyUtc(ymd: string): string {
  const [yStr, mStr, dStr] = ymd.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const d = Number(dStr)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd
  const date = new Date(Date.UTC(y, m - 1, d))
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = temp.getUTCDay() || 7
  temp.setUTCDate(temp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${temp.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`
}

/** One weekly OHLC per ISO week from sorted dividend-adjusted daily bars. */
export function aggregateFmpDailyToWeeklyOhlc(daily: OhlcvBar[]): OhlcvBar[] {
  const sorted = [...daily].sort((a, b) => a.t - b.t)
  const groups = new Map<string, OhlcvBar[]>()
  for (const row of sorted) {
    const wk = isoWeekKeyUtc(ymdFromUtcMs(row.t))
    const g = groups.get(wk) ?? []
    g.push(row)
    groups.set(wk, g)
  }
  const out: OhlcvBar[] = []
  for (const g of groups.values()) {
    if (g.length === 0) continue
    const first = g[0]!
    const last = g[g.length - 1]!
    const o = first.o
    const c = last.c
    const h = Math.max(...g.map((x) => x.h))
    const l = Math.min(...g.map((x) => x.l))
    out.push({ t: last.t, o, h, l, c })
  }
  out.sort((a, b) => a.t - b.t)
  return out
}

function parseQuoteCurrency(quoteRaw: unknown): string | undefined {
  if (!Array.isArray(quoteRaw) || quoteRaw.length === 0) return undefined
  const q = quoteRaw[0] as JsonRecord
  const c = q.currency
  return typeof c === 'string' && c.trim() ? c.trim() : undefined
}

/**
 * FMP dividend-adjusted EOD often returns **adjClose** split-adjusted while **open/high/low/close**
 * may be raw, string-encoded, or misaligned with `adjClose`. Scale raw OHLC by `adjClose/close` when both exist;
 * otherwise chain **open** from the previous bar's adjusted close so bodies are not flat dashes.
 */
function parseFmpDailyOhlcv(rows: JsonRecord[]): OhlcvBar[] {
  type Row = {
    t: number
    adjC: number | null
    rawO: number | null
    rawH: number | null
    rawL: number | null
    rawC: number | null
  }
  const temp: Row[] = []
  for (const row of rows) {
    const date = typeof row.date === 'string' ? row.date : null
    if (!date) continue
    const t = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
    )
    const adjC = pickNumber(row.adjClose) ?? pickNumber(row.adjclose)
    const rawC = pickNumber(row.close)
    const rawO = pickNumber(row.open)
    const rawH = pickNumber(row.high)
    const rawL = pickNumber(row.low)
    if (adjC === null && rawC === null) continue
    temp.push({ t, adjC, rawO, rawH, rawL, rawC })
  }
  temp.sort((a, b) => a.t - b.t)

  const daily: OhlcvBar[] = []
  let prevAdjClose: number | null = null
  for (const row of temp) {
    const { t, adjC, rawO, rawH, rawL, rawC } = row
    let o: number
    let h: number
    let l: number
    let c: number

    if (adjC !== null && rawC !== null && Math.abs(rawC) > 1e-12) {
      const r = adjC / rawC
      c = adjC
      o = (rawO ?? rawC) * r
      h = (rawH ?? rawC) * r
      l = (rawL ?? rawC) * r
    } else if (rawC !== null) {
      c = rawC
      o = rawO ?? rawC
      h = rawH ?? Math.max(o, rawC)
      l = rawL ?? Math.min(o, rawC)
    } else if (adjC !== null) {
      c = adjC
      o = prevAdjClose ?? adjC
      h = Math.max(o, c)
      l = Math.min(o, c)
    } else {
      continue
    }

    h = Math.max(h, o, c)
    l = Math.min(l, o, c)
    daily.push({ t, o, h, l, c })
    prevAdjClose = c
  }
  return daily
}

function sliceFromMinTime(bars: OhlcvBar[], minT: number): OhlcvBar[] {
  return bars.filter((b) => b.t >= minT)
}

/**
 * ~2y weekly + ~6mo daily OHLC from one FMP **dividend-adjusted daily** EOD pull (`historical-price-eod/dividend-adjusted`).
 */
export async function fetchFmpPriceCharts(
  symbol: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<PriceChartsPayload> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) throw new Error('Missing symbol')
  if (!apiKey) throw new Error('Missing FMP API key')

  const q = encodeURIComponent(sym)
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS)
  const fromStr = from.toISOString().slice(0, 10)

  const histPath = `/stable/historical-price-eod/dividend-adjusted?symbol=${q}&from=${encodeURIComponent(fromStr)}`
  const quotePath = `/stable/quote?symbol=${q}`

  const [histRaw, quoteRaw] = await Promise.all([
    fmpGet<unknown>(histPath, apiKey, { signal: options?.signal }),
    fmpGet<unknown>(quotePath, apiKey, { signal: options?.signal }).catch(() => null),
  ])

  if (fmpPayloadHasErrorMessage(histRaw)) {
    throw new Error('FMP dividend-adjusted history returned an error payload')
  }

  const dailyAll = parseFmpDailyOhlcv(asArray(histRaw))
  if (dailyAll.length === 0) {
    throw new Error('FMP dividend-adjusted history: no rows')
  }

  const now = Date.now()
  let daily = sliceFromMinTime(dailyAll, now - MS_6M)
  if (daily.length < 4) {
    daily = dailyAll.slice(-Math.min(140, dailyAll.length))
  }

  const weeklyAll = aggregateFmpDailyToWeeklyOhlc(dailyAll)
  let weekly = sliceFromMinTime(weeklyAll, now - MS_2Y)
  if (weekly.length < 2) {
    weekly = weeklyAll.slice(-Math.min(110, weeklyAll.length))
  }

  if (weekly.length === 0 || daily.length === 0) {
    throw new Error('FMP price charts: insufficient data')
  }

  const currency =
    (quoteRaw && !fmpPayloadHasErrorMessage(quoteRaw) ? parseQuoteCurrency(quoteRaw) : undefined) ?? 'USD'

  return {
    symbol: sym,
    currency,
    weekly,
    daily,
    chartProvider: 'fmp',
  }
}
