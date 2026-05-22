import { fmpGet } from '../fmp/http'
import { candidateFingerprint } from './fingerprint'
import type { NewsCandidate } from './types'

type JsonRecord = Record<string, unknown>

function parseFmpDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const t = raw.trim()
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

function rowText(row: JsonRecord, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function normalizeFmpRow(
  row: unknown,
  sourceType: 'fmp_news' | 'fmp_press',
  anchorSymbol: string,
  laneIds: string[],
): NewsCandidate | null {
  if (!row || typeof row !== 'object') return null
  const o = row as JsonRecord
  const headline = rowText(o, ['title', 'headline', 'text'])
  const excerpt = rowText(o, ['text', 'description', 'snippet', 'content']) || headline
  const sourceUrl = rowText(o, ['url', 'link', 'articleURL', 'articleUrl'])
  if (!headline || !sourceUrl) return null
  const publishedAt =
    parseFmpDate(o.publishedDate) ??
    parseFmpDate(o.date) ??
    parseFmpDate(o.published_at) ??
    new Date()
  const fp = candidateFingerprint(sourceUrl, headline)
  return {
    fingerprint: fp,
    sourceType,
    sourceUrl,
    anchorSymbol,
    laneIds: [...laneIds],
    publishedAt,
    headline,
    excerpt: excerpt.slice(0, 4000),
    secItems: undefined,
  }
}

export async function fetchFmpNewsForSymbol(
  symbol: string,
  apiKey: string,
  laneIds: string[],
  options?: { signal?: AbortSignal; limit?: number },
): Promise<NewsCandidate[]> {
  const q = encodeURIComponent(symbol.trim().toUpperCase())
  const limit = options?.limit ?? 25
  const out: NewsCandidate[] = []

  const [newsRaw, pressRaw] = await Promise.all([
    fmpGet<unknown>(`/stable/news/stock?symbols=${q}&limit=${limit}`, apiKey, { signal: options?.signal }).catch(
      () => [],
    ),
    fmpGet<unknown>(`/stable/news/press-releases?symbols=${q}&limit=${limit}`, apiKey, {
      signal: options?.signal,
    }).catch(() => []),
  ])

  const newsRows = Array.isArray(newsRaw) ? newsRaw : []
  const pressRows = Array.isArray(pressRaw) ? pressRaw : []

  for (const row of newsRows) {
    const c = normalizeFmpRow(row, 'fmp_news', symbol, laneIds)
    if (c) out.push(c)
  }
  for (const row of pressRows) {
    const c = normalizeFmpRow(row, 'fmp_press', symbol, laneIds)
    if (c) out.push(c)
  }
  return out
}
