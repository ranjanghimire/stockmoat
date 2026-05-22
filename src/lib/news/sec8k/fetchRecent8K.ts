import { candidateFingerprint } from '../fingerprint'
import type { NewsCandidate } from '../types'
import {
  accessionToFilingBase,
  cikToSubmissionsPath,
  loadSecTickerCikMap,
  resolveCik,
} from './cikLookup'
import { build8kExcerpt, build8kHeadline, parse8kDocument } from './parse8k'
import { isMaterial8KItemCode } from './materialItems'

type JsonRecord = Record<string, unknown>

const SEC_HEADERS_BASE = {
  'User-Agent': 'StockMoat/1.0 (news-pipeline; contact: support@stockmoat.local)',
  Accept: 'application/json',
}

function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysAgoYmd(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

async function secFetch(url: string, userAgent?: string): Promise<Response> {
  const headers = { ...SEC_HEADERS_BASE, 'User-Agent': userAgent?.trim() || SEC_HEADERS_BASE['User-Agent'] }
  const res = await fetch(url, { headers })
  return res
}

async function fetch8kPrimaryDocument(
  cik: string,
  accessionNumber: string,
  primaryDocument: string,
  userAgent?: string,
): Promise<string> {
  const base = accessionToFilingBase(cik, accessionNumber)
  const url = `${base}/${primaryDocument}`
  const res = await secFetch(url, userAgent)
  if (!res.ok) throw new Error(`8-K doc fetch ${res.status} ${url}`)
  return res.text()
}

export interface Sec8KFetchOptions {
  userAgent?: string
  lookbackDays?: number
  maxPerSymbol?: number
  gapMs?: number
}

export async function fetchRecent8KCandidates(
  symbols: string[],
  symbolToLanes: Map<string, string[]>,
  knownAccessions: Set<string>,
  options?: Sec8KFetchOptions,
): Promise<{ candidates: NewsCandidate[]; newAccessions: string[] }> {
  const lookback = options?.lookbackDays ?? 14
  const maxPer = options?.maxPerSymbol ?? 3
  const gapMs = options?.gapMs ?? 250
  const minYmd = daysAgoYmd(lookback)

  const cikMap = await loadSecTickerCikMap(options?.userAgent)
  const candidates: NewsCandidate[] = []
  const newAccessions: string[] = []

  for (const symbol of symbols) {
    const sym = symbol.trim().toUpperCase()
    const laneIds = symbolToLanes.get(sym) ?? []
    const cik = resolveCik(sym, cikMap)
    if (!cik) continue

    const subUrl = cikToSubmissionsPath(cik)
    const subRes = await secFetch(subUrl, options?.userAgent)
    if (!subRes.ok) {
      await sleep(gapMs)
      continue
    }
    const sub = (await subRes.json()) as JsonRecord
    const recent = sub.recent as JsonRecord | undefined
    if (!recent) {
      await sleep(gapMs)
      continue
    }

    const forms = recent.form as string[] | undefined
    const accessions = recent.accessionNumber as string[] | undefined
    const filingDates = recent.filingDate as string[] | undefined
    const primaryDocs = recent.primaryDocument as string[] | undefined
    if (!forms || !accessions || !filingDates || !primaryDocs) {
      await sleep(gapMs)
      continue
    }

    let picked = 0
    for (let i = 0; i < forms.length && picked < maxPer; i++) {
      if (forms[i] !== '8-K') continue
      const acc = accessions[i]
      const ymd = filingDates[i]
      const doc = primaryDocs[i]
      if (!acc || !ymd || !doc || ymd < minYmd) continue
      if (knownAccessions.has(acc)) continue

      try {
        const html = await fetch8kPrimaryDocument(cik, acc, doc, options?.userAgent)
        const parsed = parse8kDocument(html)
        const materialItems = parsed.items.filter((it) => isMaterial8KItemCode(it.code))
        if (materialItems.length === 0) continue

        const headline = build8kHeadline(sym, materialItems)
        const excerpt = build8kExcerpt(materialItems, parsed.plainText)
        const base = accessionToFilingBase(cik, acc)
        const sourceUrl = `${base}/${doc}`
        const publishedAt = parseYmd(ymd) ?? new Date()
        const fp = candidateFingerprint(`sec:${acc}`, headline)

        candidates.push({
          fingerprint: fp,
          sourceType: 'sec_8k',
          sourceUrl,
          anchorSymbol: sym,
          laneIds: [...laneIds],
          publishedAt,
          headline,
          excerpt,
          secItems: materialItems.map((it) => it.code),
        })
        newAccessions.push(acc)
        picked++
      } catch {
        /* skip broken filing */
      }
      await sleep(gapMs)
    }
    await sleep(gapMs)
  }

  return { candidates, newAccessions }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
