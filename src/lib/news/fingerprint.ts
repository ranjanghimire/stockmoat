import { createHash } from 'node:crypto'

export function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url.trim())
    u.hash = ''
    u.search = ''
    return u.toString().toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

export function normalizeTitleForDedupe(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export function candidateFingerprint(sourceUrl: string, headline: string): string {
  const base = `${normalizeUrlForDedupe(sourceUrl)}|${normalizeTitleForDedupe(headline)}`
  return createHash('sha256').update(base, 'utf8').digest('hex')
}
