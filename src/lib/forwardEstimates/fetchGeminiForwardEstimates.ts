import type { ForwardEstimatesSeries } from '../fmp/parseForwardEstimates'
import { DEFAULT_GEMINI_NEWS_MODEL } from '../news/geminiScore'

const GEMINI_ROOT = 'https://generativelanguage.googleapis.com/v1beta'

/** Same default as news pipeline; override with GEMINI_MODEL env or options.model. */
export const DEFAULT_GEMINI_FORWARD_MODEL = DEFAULT_GEMINI_NEWS_MODEL

export interface GeminiForwardEstimatesJson {
  revenue: Array<{ fy: number; value_usd: number }>
  eps: Array<{ fy: number; value: number }>
}

const SYSTEM = `You are an equity research data extractor. Return ONLY valid JSON, no markdown.

Schema:
{
  "revenue": [{"fy": 2026, "value_usd": 253080000000}],
  "eps": [{"fy": 2026, "value": 32.32}]
}

Rules:
- Only forward fiscal years (consensus or company guidance). No historical actuals.
- fy = fiscal year label (e.g. 2026 for FY2026).
- value_usd = revenue in US dollars (not billions — use full integer dollars).
- eps = dollars per share.
- Include at most 3 future years per array.
- Omit a year entirely if you have no credible consensus — do not guess.
- Use only well-established analyst consensus when available.`

function buildUserPrompt(ticker: string, companyName: string, lastActualFy?: number): string {
  const tail = lastActualFy !== undefined ? ` Last reported fiscal year with actuals: FY${lastActualFy}.` : ''
  return `Company: ${companyName} (${ticker}).${tail}

Output the next up to 3 fiscal years of analyst consensus revenue (value_usd) and EPS (value) as JSON matching the schema.`
}

function parseGeminiJson(text: string): GeminiForwardEstimatesJson {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Gemini forward estimates: JSON parse failed')
    parsed = JSON.parse(m[0])
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Gemini forward estimates: expected object')
  const o = parsed as GeminiForwardEstimatesJson
  if (!Array.isArray(o.revenue)) o.revenue = []
  if (!Array.isArray(o.eps)) o.eps = []
  return o
}

export function forwardSeriesFromGeminiJson(
  symbol: string,
  json: GeminiForwardEstimatesJson,
): ForwardEstimatesSeries {
  const revenue = json.revenue
    .filter((r) => Number.isFinite(r.fy) && Number.isFinite(r.value_usd) && r.value_usd > 0)
    .sort((a, b) => a.fy - b.fy)
    .slice(0, 3)
    .map((r) => ({ fiscalYear: r.fy, revenueUsd: r.value_usd }))

  const eps = json.eps
    .filter((e) => Number.isFinite(e.fy) && Number.isFinite(e.value) && e.value > 0)
    .sort((a, b) => a.fy - b.fy)
    .slice(0, 3)
    .map((e) => ({ fiscalYear: e.fy, eps: e.value }))

  return { symbol: symbol.toUpperCase(), source: 'gemini', revenue, eps }
}

export async function fetchGeminiForwardEstimates(
  ticker: string,
  companyName: string,
  apiKey: string,
  options?: { model?: string; lastActualFiscalYear?: number; signal?: AbortSignal },
): Promise<ForwardEstimatesSeries> {
  const model = options?.model ?? DEFAULT_GEMINI_FORWARD_MODEL
  const url = `${GEMINI_ROOT}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${SYSTEM}\n\n${buildUserPrompt(ticker, companyName, options?.lastActualFiscalYear)}` }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini forward estimates failed (${res.status}): ${errText.slice(0, 300)}`)
  }

  const raw = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = (raw.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (!text) throw new Error('Gemini forward estimates: empty response')

  const json = parseGeminiJson(text)
  return forwardSeriesFromGeminiJson(ticker, json)
}
