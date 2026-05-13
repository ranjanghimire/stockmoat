import { fmpGet } from './http'
import { asArray, firstRow, type JsonRecord } from './normalize'

export interface CompanyRawPack {
  profile: JsonRecord | undefined
  quote: JsonRecord | undefined
  keyMetricsTtm: JsonRecord | undefined
  ratiosTtm: JsonRecord | undefined
  incomeAnnual: JsonRecord[]
  cashFlowAnnual: JsonRecord[]
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
  ] = await Promise.all([
    fmpGet<unknown>(`/stable/profile?symbol=${q}`, apiKey),
    fmpGet<unknown>(`/stable/quote?symbol=${q}`, apiKey),
    fmpGet<unknown>(`/stable/key-metrics-ttm?symbol=${q}`, apiKey),
    fmpGet<unknown>(`/stable/ratios-ttm?symbol=${q}`, apiKey),
    fmpGet<unknown>(`/stable/income-statement?symbol=${q}&period=annual&limit=8`, apiKey),
    fmpGet<unknown>(`/stable/cash-flow-statement?symbol=${q}&period=annual&limit=8`, apiKey),
    fmpGet<unknown>(`/stable/financial-scores?symbol=${q}`, apiKey).catch(() => null),
    fmpGet<unknown>(`/stable/stock-peers?symbol=${q}`, apiKey).catch(() => null),
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

  return {
    profile: firstRow(profileArr),
    quote: firstRow(quoteArr),
    keyMetricsTtm: firstRow(kmTtmArr),
    ratiosTtm: firstRow(ratiosTtmArr),
    incomeAnnual: incomeArr,
    cashFlowAnnual: cfArr,
    score,
    peers,
  }
}
