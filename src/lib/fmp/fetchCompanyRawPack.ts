import { fmpGet } from './http'
import { asArray, firstRow, type JsonRecord } from './normalize'

/** FMP free/starter plans reject `limit` > 5 on statement endpoints (402). */
const FMP_ANNUAL_STATEMENT_LIMIT = 5

export interface CompanyRawPack {
  profile: JsonRecord | undefined
  quote: JsonRecord | undefined
  keyMetricsTtm: JsonRecord | undefined
  ratiosTtm: JsonRecord | undefined
  incomeAnnual: JsonRecord[]
  cashFlowAnnual: JsonRecord[]
  incomeTtm: JsonRecord | undefined
  cashFlowTtm: JsonRecord | undefined
  balanceSheetAnnual: JsonRecord[]
  analystEstimates: JsonRecord[]
  score: JsonRecord | undefined
  peers: string[]
}

function parseStockPeersPayload(data: unknown, subject: string): string[] {
  const sub = subject.toUpperCase()
  const out: string[] = []

  const add = (sym: string) => {
    const u = sym.trim().toUpperCase()
    if (u && u !== sub && !out.includes(u)) out.push(u)
  }

  if (Array.isArray(data) && data.every((x) => typeof x === 'string')) {
    for (const s of data as string[]) add(s)
    return out
  }

  const rows = asArray<JsonRecord>(data)
  for (const row of rows) {
    if (typeof row.peers === 'string') {
      for (const part of row.peers.split(',')) add(part)
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
    cfRaw,
    scoreRaw,
    peersRaw,
    incomeTtmRaw,
    cfTtmRaw,
    bsRaw,
    analystRaw,
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
      `/stable/analyst-estimates?symbol=${q}&period=annual&limit=${FMP_ANNUAL_STATEMENT_LIMIT}`,
      apiKey,
    ).catch(() => null),
  ])

  const profileArr = asArray<JsonRecord>(profileRaw)
  const quoteArr = asArray<JsonRecord>(quoteRaw)
  const kmTtmArr = asArray<JsonRecord>(kmTtmRaw)
  const ratiosTtmArr = asArray<JsonRecord>(ratiosTtmRaw)
  const incomeArr = asArray<JsonRecord>(incomeRaw)
  const cfArr = asArray<JsonRecord>(cfRaw)
  const scoreArr = scoreRaw === null ? [] : asArray<JsonRecord>(scoreRaw)
  const score = firstRow(scoreArr)

  const peers = peersRaw === null ? [] : parseStockPeersPayload(peersRaw, sym)

  const incomeTtmArr = asArray<JsonRecord>(incomeTtmRaw)
  const cfTtmArr = asArray<JsonRecord>(cfTtmRaw)
  const bsArr = bsRaw === null ? [] : asArray<JsonRecord>(bsRaw)
  const analystArr = analystRaw === null ? [] : asArray<JsonRecord>(analystRaw)

  return {
    profile: firstRow(profileArr),
    quote: firstRow(quoteArr),
    keyMetricsTtm: firstRow(kmTtmArr),
    ratiosTtm: firstRow(ratiosTtmArr),
    incomeAnnual: incomeArr,
    cashFlowAnnual: cfArr,
    incomeTtm: firstRow(incomeTtmArr),
    cashFlowTtm: firstRow(cfTtmArr),
    balanceSheetAnnual: bsArr,
    analystEstimates: analystArr,
    score,
    peers,
  }
}
