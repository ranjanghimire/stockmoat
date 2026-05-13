/** Canonical display order (YAML uses these ids). */
export const PILLAR_ORDER = ['valuation', 'quality', 'safety', 'cash_truth', 'stability'] as const

export type PillarId = (typeof PILLAR_ORDER)[number]

export const PILLAR_LABEL: Record<string, string> = {
  valuation: 'Valuation',
  quality: 'Quality',
  safety: 'Balance sheet',
  cash_truth: 'Cash truth',
  stability: 'Stability',
}

/** One-line intent for the pillar detail panel. */
export const PILLAR_INTRO: Record<string, string> = {
  valuation:
    'How cheap or rich the stock looks versus peers and its own history (multiples, yield, forward vs trailing).',
  quality:
    'Operating and return metrics that indicate business quality and efficiency versus comparable companies.',
  safety:
    'Leverage, coverage, capital, and asset-quality checks — including hard gates where the model requires a minimum standard.',
  cash_truth:
    'Whether reported earnings show up in cash generation (e.g. operating cash flow vs net income).',
  stability:
    'Persistence of fundamentals and balance-sheet health signals such as Piotroski-style durability.',
}

export function sortPillarKeys<T extends { pillar: string }>(pillars: T[]): T[] {
  const rank = new Map<string, number>(PILLAR_ORDER.map((p, i) => [p, i]))
  return [...pillars].sort((a, b) => (rank.get(a.pillar) ?? 99) - (rank.get(b.pillar) ?? 99))
}

export function sortPillarIds(ids: string[]): string[] {
  const rank = new Map<string, number>(PILLAR_ORDER.map((p, i) => [p, i]))
  return [...ids].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99))
}
