import { normalizeTitleForDedupe } from './fingerprint'

/** Jaccard-like token overlap for near-duplicate headlines. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitleForDedupe(a).split(' ').filter((w) => w.length > 2))
  const tb = new Set(normalizeTitleForDedupe(b).split(' ').filter((w) => w.length > 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  return inter / (ta.size + tb.size - inter)
}

export function isNearDuplicateTitle(a: string, b: string, threshold = 0.72): boolean {
  return titleSimilarity(a, b) >= threshold
}
