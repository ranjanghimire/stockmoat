import type { GeminiNewsScore, NewsCandidate } from './types'

const GEMINI_ROOT = 'https://generativelanguage.googleapis.com/v1beta'

const RUBRIC = `You score financial news for a "material events only" digest for long-term investors.

Publish ONLY if the event could materially change sector economics, regulation, M&A, major contracts, capex, leadership, or company moat within 12 months.

REJECT (publish=false): routine earnings recaps, price targets, daily price moves, minor product blogs, generic partnerships without $ or strategic scale.

IMPACT 1-10: 8+ = sector-wide or multi-billion / policy-level. 7 = borderline.

Categories: govt_policy, megadeal, capex, m_and_a, earnings_guide, exec, product, other.

Return JSON array only, one object per input item, same order:
{"publish":boolean,"impact_score":number,"category":string,"lane_ids":string[],"tickers":string[],"headline_display":string,"why_material":string}`

export async function scoreNewsCandidatesWithGemini(
  items: NewsCandidate[],
  apiKey: string,
  model: string,
): Promise<GeminiNewsScore[]> {
  if (items.length === 0) return []

  const payload = items.map((c, i) => ({
    index: i,
    source: c.sourceType,
    anchor: c.anchorSymbol,
    lanes: c.laneIds,
    headline: c.headline,
    excerpt: c.excerpt.slice(0, 1500),
    sec_items: c.secItems ?? [],
    published: c.publishedAt.toISOString(),
  }))

  const url = `${GEMINI_ROOT}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  }
  if (model.includes('2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 }
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${RUBRIC}\n\nItems:\n${JSON.stringify(payload)}` }],
      },
    ],
    generationConfig,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini failed (${res.status}): ${errText.slice(0, 300)}`)
  }

  const raw = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const parts = raw.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((p) => p.text ?? '').join('').trim()
  if (!text) throw new Error('Gemini returned empty text')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) throw new Error('Gemini JSON parse failed')
    parsed = JSON.parse(m[0])
  }

  const arr = Array.isArray(parsed) ? parsed : [parsed]
  const scores: GeminiNewsScore[] = []

  for (let i = 0; i < items.length; i++) {
    const row = arr[i] as Record<string, unknown> | undefined
    scores.push(normalizeScore(row, items[i]))
  }
  return scores
}

function normalizeScore(row: Record<string, unknown> | undefined, fallback: NewsCandidate): GeminiNewsScore {
  const impact = clampInt(row?.impact_score, 1, 10, 5)
  const publish = row?.publish === true || (row?.publish !== false && impact >= 8)
  const category = typeof row?.category === 'string' ? row.category : 'other'
  const lane_ids = stringArray(row?.lane_ids, fallback.laneIds)
  const tickers = stringArray(row?.tickers, [fallback.anchorSymbol])
  const headline_display =
    typeof row?.headline_display === 'string' && row.headline_display.trim()
      ? row.headline_display.trim()
      : fallback.headline
  const why_material =
    typeof row?.why_material === 'string' && row.why_material.trim()
      ? row.why_material.trim()
      : fallback.excerpt.slice(0, 280)

  return {
    publish,
    impact_score: impact,
    category: category as GeminiNewsScore['category'],
    lane_ids,
    tickers,
    headline_display,
    why_material,
  }
}

function stringArray(v: unknown, def: string[]): string[] {
  if (!Array.isArray(v)) return def
  const out = v.filter((x): x is string => typeof x === 'string').map((s) => s.trim().toUpperCase())
  return out.length > 0 ? [...new Set(out)] : def
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.round(n)))
}

export const DEFAULT_GEMINI_NEWS_MODEL = 'gemini-2.5-flash'
