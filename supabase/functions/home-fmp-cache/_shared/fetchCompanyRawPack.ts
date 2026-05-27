import { fmpGet } from './http.ts'
import {
  fmpPayloadHasErrorMessage,
  fmpProfileNeedsLegacyEnrichment,
  mergeFmpProfileRows,
} from './profileClassification.ts'
import { asArray, firstRow, type JsonRecord } from './normalize.ts'

/** FMP free/starter plans reject `limit` > 5 on statement endpoints (402). */
const FMP_ANNUAL_STATEMENT_LIMIT = 5
/** Analyst estimates often need more rows to cover 3 forward FYs after filtering actuals. */
export const FMP_ANALYST_ESTIMATES_LIMIT = 10

export interface CompanyRawPack {
  profile: JsonRecord | undefined
  quote: JsonRecord | undefined
  keyMetricsTtm: JsonRecord | undefined
  ratiosTtm: JsonRecord | undefined
  incomeAnnual: JsonRecord[]
  /** Same `limit` as annual (starter plans often cap statement `limit`). */
  incomeQuarterly: JsonRecord[]
  cashFlowAnnual: JsonRecord[]
  incomeTtm: JsonRecord | undefined
  cashFlowTtm: JsonRecord | undefined
  balanceSheetAnnual: JsonRecord[]
  balanceSheetQuarterly: JsonRecord[]
  analystEstimates: JsonRecord[]
  /** FMP `/stable/analyst-stock-recommendations` time series; empty when unavailable or Yahoo-shaped pack. */
  analystStockRecommendations: JsonRecord[]
  /** FMP `/stable/grades-consensus` summary row when available (often populated when the recommendations series is empty). */
  gradesConsensus?: JsonRecord
  score: JsonRecord | undefined
  peers: string[]
}

/** Stable payloads are usually arrays; some endpoints nest rows under `historical` / `data`. */
function fmpRowsFromPayload(raw: unknown): JsonRecord[] {
  if (raw === null || raw === undefined) return []
  if (fmpPayloadHasErrorMessage(raw)) return []
  if (Array.isArray(raw)) return raw as JsonRecord[]
  if (typeof raw === 'object') {
    const o = raw as JsonRecord
    const nested = o.historical ?? o.data ?? o.recommendations ?? o.rows
    if (Array.isArray(nested)) return nested as JsonRecord[]
  }
  return asArray<JsonRecord>(raw)
}

function splitPeerTokens(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseStockPeersPayload(data: unknown, subject: string): string[] {
  if (fmpPayloadHasErrorMessage(data)) return []

  const sub = subject.toUpperCase()
  const out: string[] = []

  const add = (sym: string) => {
    const u = sym.trim().toUpperCase()
    if (u && u !== sub && !out.includes(u)) out.push(u)
  }

  if (typeof data === 'string') {
    for (const part of splitPeerTokens(data)) add(part)
    return out
  }

  if (Array.isArray(data) && data.every((x) => typeof x === 'string')) {
    for (const s of data as string[]) add(s)
    return out
  }

  const rows = asArray<JsonRecord>(data)

  const rowHasPeersField = (r: JsonRecord) =>
    'peers' in r &&
    r.peers != null &&
    (typeof r.peers === 'string'
      ? String(r.peers).trim() !== ''
      : Array.isArray(r.peers)
        ? r.peers.length > 0
        : true)

  const anyStructuredPeers = rows.some((r) => r && typeof r === 'object' && rowHasPeersField(r))

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue

    const stringListFields = ['peers', 'peerList', 'stockPeers', 'peerSymbols', 'similarStocks', 'symbolsList']
    for (const k of stringListFields) {
      const v = row[k]
      if (typeof v === 'string') {
        for (const part of splitPeerTokens(v)) add(part)
      }
    }

    if (Array.isArray(row.peers)) {
      for (const p of row.peers) {
        if (typeof p === 'string') add(p)
        else if (p && typeof p === 'object' && 'symbol' in (p as JsonRecord)) {
          const sym = (p as JsonRecord).symbol
          if (typeof sym === 'string') add(sym)
        }
      }
    }

    for (const k of ['peerSymbols', 'stockPeers', 'peerList', 'similarStocks'] as const) {
      const arr = row[k]
      if (!Array.isArray(arr)) continue
      for (const p of arr) {
        if (typeof p === 'string') add(p)
        else if (p && typeof p === 'object' && 'symbol' in (p as JsonRecord)) {
          const sym = (p as JsonRecord).symbol
          if (typeof sym === 'string') add(sym)
        }
      }
    }
  }

  if (out.length === 0 && !anyStructuredPeers && rows.length > 1) {
    for (const row of rows) {
      const sym = row.symbol
      if (typeof sym === 'string') add(sym)
    }
  }

  return out
}

export async function fetchCompanyRawPack(symbol: string, apiKey: string): Promise<CompanyRawPack> {
  const sym = symbol.toUpperCase()
  const q = encodeURIComponent(sym)

  const [
    profileRaw,
    quoteRaw,
    kmTtmRaw,
    ratiosTtmRaw,
    incomeRaw,
    incomeQuarterlyRaw,
    cfRaw,
    scoreRaw,
    peersRaw,
    incomeTtmRaw,
    cfTtmRaw,
    bsRaw,
    bsQuarterlyRaw,
    analystRaw,
    analystStockRecRaw,
    gradesConsensusRaw,
  ] = await Promise.all([
    fmpGet<unknown>(`/stable/profile?symbol=${q}`, apiKey),
    fmpGet<unknown>(`/stable/quote?symbol=${q}`, apiKey),
    fmpGet<unknown>(`/stable/key-metrics-ttm?symbol=${q}`, apiKey),
    fmpGet<unknown>(`/stable/ratios-ttm?symbol=${q}`, apiKey),
    fmpGet<unknown>(
      `/stable/income-statement?symbol=${q}&period=annual&limit=${FMP_ANNUAL_STATEMENT_LIMIT}`,
      apiKey,
    ),
    fmpGet<unknown>(
      `/stable/income-statement?symbol=${q}&period=quarter&limit=${FMP_ANNUAL_STATEMENT_LIMIT}`,
      apiKey,
    ).catch(() => null),
    fmpGet<unknown>(
      `/stable/cash-flow-statement?symbol=${q}&period=annual&limit=${FMP_ANNUAL_STATEMENT_LIMIT}`,
      apiKey,
    ),
    fmpGet<unknown>(`/stable/financial-scores?symbol=${q}`, apiKey).catch(() => null),
    fmpGet<unknown>(`/stable/stock-peers?symbol=${q}`, apiKey).catch(() => null),
    fmpGet<unknown>(`/stable/income-statement-ttm?symbol=${q}`, apiKey).catch(() => null),
    fmpGet<unknown>(`/stable/cash-flow-statement-ttm?symbol=${q}`, apiKey).catch(() => null),
    fmpGet<unknown>(
      `/stable/balance-sheet-statement?symbol=${q}&period=annual&limit=${FMP_ANNUAL_STATEMENT_LIMIT}`,
      apiKey,
    ).catch(() => null),
    fmpGet<unknown>(
      `/stable/balance-sheet-statement?symbol=${q}&period=quarter&limit=${FMP_ANNUAL_STATEMENT_LIMIT}`,
      apiKey,
    ).catch(() => null),
    fmpGet<unknown>(
      `/stable/analyst-estimates?symbol=${q}&period=annual&limit=${FMP_ANALYST_ESTIMATES_LIMIT}`,
      apiKey,
    ).catch(() => null),
    fmpGet<unknown>(`/stable/analyst-stock-recommendations?symbol=${q}`, apiKey).catch(() => null),
    fmpGet<unknown>(`/stable/grades-consensus?symbol=${q}`, apiKey).catch(() => null),
  ])

  const profileStableArr = fmpPayloadHasErrorMessage(profileRaw) ? [] : asArray<JsonRecord>(profileRaw)
  const stableProfile = firstRow(profileStableArr)
  let profile: JsonRecord | undefined = stableProfile
  if (fmpProfileNeedsLegacyEnrichment(stableProfile)) {
    try {
      const v3Raw = await fmpGet<unknown>(`/api/v3/profile/${q}`, apiKey)
      if (!fmpPayloadHasErrorMessage(v3Raw)) {
        const v3Row = firstRow(asArray<JsonRecord>(v3Raw))
        profile = mergeFmpProfileRows(stableProfile, v3Row)
      }
    } catch {
      profile = stableProfile
    }
  }

  const quoteArr = asArray<JsonRecord>(quoteRaw)
  const kmTtmArr = asArray<JsonRecord>(kmTtmRaw)
  const ratiosTtmArr = asArray<JsonRecord>(ratiosTtmRaw)
  const incomeArr = asArray<JsonRecord>(incomeRaw)
  const incomeQuarterlyArr =
    incomeQuarterlyRaw === null || fmpPayloadHasErrorMessage(incomeQuarterlyRaw)
      ? []
      : asArray<JsonRecord>(incomeQuarterlyRaw)
  const cfArr = asArray<JsonRecord>(cfRaw)
  const scoreArr = scoreRaw === null ? [] : asArray<JsonRecord>(scoreRaw)
  const score = firstRow(scoreArr)

  const peers =
    peersRaw === null || fmpPayloadHasErrorMessage(peersRaw) ? [] : parseStockPeersPayload(peersRaw, sym)

  const incomeTtmArr = asArray<JsonRecord>(incomeTtmRaw)
  const cfTtmArr = asArray<JsonRecord>(cfTtmRaw)
  const bsArr = bsRaw === null ? [] : asArray<JsonRecord>(bsRaw)
  const bsQuarterlyArr =
    bsQuarterlyRaw === null || fmpPayloadHasErrorMessage(bsQuarterlyRaw)
      ? []
      : asArray<JsonRecord>(bsQuarterlyRaw)
  const analystArr = analystRaw === null ? [] : asArray<JsonRecord>(analystRaw)
  const analystStockRecommendationsArr =
    analystStockRecRaw === null || fmpPayloadHasErrorMessage(analystStockRecRaw)
      ? []
      : fmpRowsFromPayload(analystStockRecRaw)

  let gradesConsensus: JsonRecord | undefined
  if (gradesConsensusRaw !== null && !fmpPayloadHasErrorMessage(gradesConsensusRaw)) {
    const rows = fmpRowsFromPayload(gradesConsensusRaw)
    gradesConsensus = firstRow(rows) ?? (typeof gradesConsensusRaw === 'object' && !Array.isArray(gradesConsensusRaw)
      ? (gradesConsensusRaw as JsonRecord)
      : undefined)
    if (gradesConsensus && fmpPayloadHasErrorMessage(gradesConsensus)) gradesConsensus = undefined
  }

  return {
    profile,
    quote: firstRow(quoteArr),
    keyMetricsTtm: firstRow(kmTtmArr),
    ratiosTtm: firstRow(ratiosTtmArr),
    incomeAnnual: incomeArr,
    incomeQuarterly: incomeQuarterlyArr,
    cashFlowAnnual: cfArr,
    incomeTtm: firstRow(incomeTtmArr),
    cashFlowTtm: firstRow(cfTtmArr),
    balanceSheetAnnual: bsArr,
    balanceSheetQuarterly: bsQuarterlyArr,
    analystEstimates: analystArr,
    analystStockRecommendations: analystStockRecommendationsArr,
    ...(gradesConsensus !== undefined ? { gradesConsensus } : {}),
    score,
    peers,
  }
}

/** Lightweight fetch for forward-growth refresh (no full pack). */
export async function fetchAnalystEstimatesAnnual(
  symbol: string,
  apiKey: string,
  options?: { signal?: AbortSignal; limit?: number },
): Promise<JsonRecord[]> {
  const q = encodeURIComponent(symbol.toUpperCase())
  const limit = options?.limit ?? FMP_ANALYST_ESTIMATES_LIMIT
  const raw = await fmpGet<unknown>(
    `/stable/analyst-estimates?symbol=${q}&period=annual&limit=${limit}`,
    apiKey,
    { signal: options?.signal },
  )
  return asArray<JsonRecord>(raw)
}
