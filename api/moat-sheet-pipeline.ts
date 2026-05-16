import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// --- Validation (inlined: Vercel ships one file per route; subpaths under api/ are not bundled) ---
// Keep filler rules aligned with `src/lib/editorial/recentDealsOverrides.ts`.

function isGenericRecentDealsFiller(text: string): boolean {
  const t = text.trim()
  if (t.length < 50) return false
  if (/\bbest tracked through investor relations\b/i.test(t)) return true
  if (/\bthis automated summary highlights\b/i.test(t)) return true
  if (/\bshould be refreshed periodically\b/i.test(t)) return true
  if (/\bsec filings\b/i.test(t) && /\bautomated summary\b/i.test(t)) return true
  return false
}

const BLOCKLIST: RegExp[] = [
  /\bas an ai language model\b/i,
  /\bi cannot (provide|verify)\b/i,
  /\[insert\b/i,
  /\bbest tracked through investor relations\b/i,
  /\bthis automated summary highlights\b/i,
  /\bshould be refreshed periodically\b/i,
  /\blorem ipsum\b/i,
]

function checkBlocklist(text: string, label: string): string | null {
  for (const re of BLOCKLIST) {
    if (re.test(text)) return `${label} contains disallowed boilerplate (${re.source})`
  }
  return null
}

export interface MoatSheetUpsertFields {
  body: string
  how_they_make_money_body: string | null
  recent_deals_body: string | null
}

const MAX_LEN = 12_000

/** Exported for Vitest — same checks used before DB upsert. */
export function validateMoatSheetUpsert(
  fields: MoatSheetUpsertFields,
): { ok: true } | { ok: false; reason: string } {
  const body = fields.body.trim()
  if (body.length < 80) {
    return { ok: false, reason: "What's the moat (body) is too short — likely incomplete or garbage." }
  }
  if (body.length > MAX_LEN) return { ok: false, reason: 'Moat body exceeds maximum length.' }
  const b1 = checkBlocklist(body, 'Moat')
  if (b1) return { ok: false, reason: b1 }

  const how = (fields.how_they_make_money_body ?? '').trim()
  if (how.length > 0) {
    if (how.length < 60) {
      return { ok: false, reason: 'How they make money is too short when non-empty — likely incomplete.' }
    }
    if (how.length > MAX_LEN) return { ok: false, reason: 'How they make money exceeds maximum length.' }
    const b2 = checkBlocklist(how, 'How they make money')
    if (b2) return { ok: false, reason: b2 }
  }

  const deals = (fields.recent_deals_body ?? '').trim()
  if (deals.length > 0) {
    if (deals.length < 60) {
      return { ok: false, reason: 'Recent deals is too short when non-empty — likely incomplete.' }
    }
    if (deals.length > MAX_LEN) return { ok: false, reason: 'Recent deals exceeds maximum length.' }
    if (isGenericRecentDealsFiller(deals)) {
      return { ok: false, reason: 'Recent deals matches generic IR / automated-summary filler.' }
    }
    const b3 = checkBlocklist(deals, 'Recent deals')
    if (b3) return { ok: false, reason: b3 }
  }

  return { ok: true }
}

// --- HTTP handler ---

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function checkPassphrase(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || !expected) return false
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return a.length === b.length && timingSafeEqual(a, b)
}

function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toUpperCase()
  if (s.length < 1 || s.length > 16) return null
  return /^[A-Z0-9][A-Z0-9.-]*$/.test(s) ? s : null
}

async function fetchTickerUnion(sb: ReturnType<typeof createClient>): Promise<string[]> {
  const out = new Set<string>()
  for (const table of ['screen_scores', 'ticker_fmp_home_cache'] as const) {
    let from = 0
    for (;;) {
      const { data, error } = await sb.from(table).select('symbol').range(from, from + 999)
      if (error) throw new Error(`${table}: ${error.message}`)
      for (const r of data ?? []) {
        const s = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
        if (s) out.add(s)
      }
      if (!data || data.length < 1000) break
      from += 1000
    }
  }
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('company_moat_summaries').select('symbol').range(from, from + 999)
    if (error) throw new Error(`company_moat_summaries: ${error.message}`)
    for (const r of data ?? []) {
      const s = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
      if (s) out.add(s)
    }
    if (!data || data.length < 1000) break
    from += 1000
  }
  return [...out].sort()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const expectedPass = process.env.MOAT_ADMIN_PASSPHRASE ?? ''
  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!expectedPass || !supabaseUrl || !serviceKey) {
    res.status(503).json({ error: 'Server misconfiguration' })
    return
  }

  const rawBody = req.body as Record<string, unknown> | undefined
  const body = rawBody && typeof rawBody === 'object' ? rawBody : {}

  if (!checkPassphrase(body.passphrase, expectedPass)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const sb = createClient(supabaseUrl, serviceKey)
  const action = body.action === 'upsert' ? 'upsert' : body.action === 'tickers' ? 'tickers' : null

  if (!action) {
    res.status(400).json({ error: 'Missing or invalid action (use "tickers" or "upsert").' })
    return
  }

  if (action === 'tickers') {
    try {
      const tickers = await fetchTickerUnion(sb)
      res.status(200).json({ ok: true, count: tickers.length, tickers })
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
    return
  }

  const sym = normalizeTicker(body.ticker)
  if (!sym) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }

  const moatBody = typeof body.body === 'string' ? body.body.trim() : ''
  const howRaw =
    typeof body.how_they_make_money_body === 'string' ? body.how_they_make_money_body.trim() : ''
  const dealsRaw = typeof body.recent_deals_body === 'string' ? body.recent_deals_body.trim() : ''

  const validation = validateMoatSheetUpsert({
    body: moatBody,
    how_they_make_money_body: howRaw.length > 0 ? howRaw : null,
    recent_deals_body: dealsRaw.length > 0 ? dealsRaw : null,
  })

  if (!validation.ok) {
    res.status(400).json({ error: validation.reason })
    return
  }

  const row = {
    symbol: sym,
    body: moatBody,
    how_they_make_money_body: howRaw.length > 0 ? howRaw : null,
    recent_deals_body: dealsRaw.length > 0 ? dealsRaw : null,
    content_source: 'curated' as const,
    updated_at: new Date().toISOString(),
  }

  const { error: upErr } = await sb.from('company_moat_summaries').upsert(row, { onConflict: 'symbol' })

  if (upErr) {
    res.status(500).json({ error: upErr.message })
    return
  }

  res.status(200).json({ ok: true, symbol: sym })
}
