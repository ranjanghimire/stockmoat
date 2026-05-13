/** Deterministic 0..1 pseudo-random from strings (demo data). */
export function ratioFromStrings(...parts: string[]): number {
  const s = parts.join('|')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = h >>> 0
  return u / 4294967296
}
