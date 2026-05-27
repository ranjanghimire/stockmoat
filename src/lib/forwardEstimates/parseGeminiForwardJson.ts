export interface GeminiForwardEstimatesJson {
  revenue: Array<{ fy: number; value_usd: number }>
  eps: Array<{ fy: number; value: number }>
}

export function stripMarkdownJsonFence(s: string): string {
  let t = s.trim()
  if (!t.startsWith('```')) return t
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/, '')
  return t.trim()
}

/** First balanced `{ ... }` substring. */
export function extractJsonObjectString(text: string): string | null {
  const cleaned = stripMarkdownJsonFence(text)
  if (!cleaned) return null

  try {
    JSON.parse(cleaned)
    return cleaned
  } catch {
    /* try substring */
  }

  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]!
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return cleaned.slice(start, i + 1)
    }
  }
  return null
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const s = v.replace(/[$,\s]/g, '').trim()
    if (!s) return undefined
    const mult = /b$/i.test(s) ? 1e9 : /m$/i.test(s) ? 1e6 : /k$/i.test(s) ? 1e3 : 1
    const core = s.replace(/[bmk]$/i, '')
    const n = Number(core)
    if (Number.isFinite(n)) return n * mult
  }
  return undefined
}

function fyFromRow(row: Record<string, unknown>): number | undefined {
  const y = num(row.fy ?? row.fiscalYear ?? row.year ?? row.calendarYear)
  if (y !== undefined) return Math.round(y)
  return undefined
}

function normalizeRevenueUsd(v: number): number {
  if (v > 0 && v < 1e5) return v * 1e9
  return v
}

function normalizeEps(v: number): number {
  return v
}

function rowsFromUnknown(
  raw: unknown,
  valueKeys: string[],
): Array<{ fy: number; value: number }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ fy: number; value: number }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const fy = fyFromRow(row)
    if (fy === undefined) continue
    let value: number | undefined
    for (const k of valueKeys) {
      value = num(row[k])
      if (value !== undefined) break
    }
    if (value === undefined) value = num(row.value)
    if (value === undefined || value <= 0) continue
    out.push({ fy, value })
  }
  return out
}

export function normalizeGeminiForwardPayload(parsed: unknown): GeminiForwardEstimatesJson {
  if (!parsed || typeof parsed !== 'object') {
    return { revenue: [], eps: [] }
  }
  const o = parsed as Record<string, unknown>

  const revRaw = o.revenue ?? o.revenues ?? o.revenueEstimates
  const epsRaw = o.eps ?? o.earnings ?? o.epsEstimates

  const revenue = rowsFromUnknown(revRaw, [
    'value_usd',
    'valueUsd',
    'revenueUsd',
    'revenue',
    'value',
    'estimate',
  ]).map((r) => ({ fy: r.fy, value_usd: normalizeRevenueUsd(r.value) }))

  const eps = rowsFromUnknown(epsRaw, ['value', 'eps', 'estimate', 'value_usd']).map((r) => ({
    fy: r.fy,
    value: normalizeEps(r.value),
  }))

  return { revenue, eps }
}

export function parseGeminiForwardJsonText(text: string): GeminiForwardEstimatesJson {
  const blob = extractJsonObjectString(text)
  if (!blob) {
    throw new Error(
      `Gemini forward estimates: JSON parse failed (no object in response, length=${text.length})`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(blob)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Gemini forward estimates: JSON parse failed (${msg})`)
  }
  return normalizeGeminiForwardPayload(parsed)
}

export type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    finishReason?: string
  }>
}

export function geminiTextFromGenerateContentResponse(raw: GeminiGenerateContentResponse): string {
  const parts = raw.candidates?.[0]?.content?.parts ?? []
  const nonThought = parts.filter((p) => p.thought !== true).map((p) => p.text ?? '').join('')
  if (nonThought.trim()) return nonThought.trim()
  return parts.map((p) => p.text ?? '').join('').trim()
}
