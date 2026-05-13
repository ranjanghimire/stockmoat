import { fmpGet } from './http'
import { firstRow, type JsonRecord } from './normalize'

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

export async function fetchCompanyRawPack(symbol: string, apiKey: string): Promise<CompanyRawPack> {
  const sym = encodeURIComponent(symbol.toUpperCase())

  const [
    profileArr,
    quoteArr,
    kmTtmArr,
    ratiosTtmArr,
    incomeArr,
    cfArr,
    scoreArr,
    peersArr,
  ] = await Promise.all([
    fmpGet<JsonRecord[]>(`/api/v3/profile/${sym}`, apiKey),
    fmpGet<JsonRecord[]>(`/api/v3/quote/${sym}`, apiKey),
    fmpGet<JsonRecord[]>(`/api/v3/key-metrics-ttm/${sym}`, apiKey),
    fmpGet<JsonRecord[]>(`/api/v3/ratios-ttm/${sym}`, apiKey),
    fmpGet<JsonRecord[]>(`/api/v3/income-statement/${sym}?limit=8&period=annual`, apiKey),
    fmpGet<JsonRecord[]>(`/api/v3/cash-flow-statement/${sym}?limit=8&period=annual`, apiKey),
    fmpGet<JsonRecord[]>(`/api/v4/score?symbol=${sym}`, apiKey).catch(() => [] as JsonRecord[]),
    fmpGet<JsonRecord[]>(`/api/v4/stock_peers?symbol=${sym}`, apiKey).catch(() => [] as JsonRecord[]),
  ])

  let score = firstRow(scoreArr)
  if (!score) {
    try {
      const alt = await fmpGet<JsonRecord[]>(`/stable/financial-scores?symbol=${sym}`, apiKey)
      score = firstRow(alt)
    } catch {
      score = undefined
    }
  }
  const peersRow = firstRow<JsonRecord>(peersArr)
  const peerString = typeof peersRow?.peers === 'string' ? peersRow.peers : ''
  const peers = peerString
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((p) => p !== symbol.toUpperCase())

  return {
    profile: firstRow(profileArr),
    quote: firstRow(quoteArr),
    keyMetricsTtm: firstRow(kmTtmArr),
    ratiosTtm: firstRow(ratiosTtmArr),
    incomeAnnual: Array.isArray(incomeArr) ? incomeArr : [],
    cashFlowAnnual: Array.isArray(cfArr) ? cfArr : [],
    score,
    peers,
  }
}
