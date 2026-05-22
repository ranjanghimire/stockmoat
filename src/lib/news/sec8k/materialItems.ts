/** 8-K items treated as potentially material before LLM scoring. */
export const MATERIAL_8K_ITEM_CODES = new Set([
  '1.01',
  '1.02',
  '1.03',
  '1.04',
  '2.01',
  '2.03',
  '2.04',
  '2.05',
  '2.06',
  '3.01',
  '3.02',
  '3.03',
  '4.01',
  '5.01',
  '5.02',
  '5.03',
  '8.01',
])

/** Routine items skipped at parse time (earnings noise, Reg FD). */
export const ROUTINE_8K_ITEM_CODES = new Set(['2.02', '7.01'])

export function isMaterial8KItemCode(code: string): boolean {
  const n = code.trim()
  return MATERIAL_8K_ITEM_CODES.has(n)
}
