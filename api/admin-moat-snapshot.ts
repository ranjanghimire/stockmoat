import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  const sym = normalizeTicker(body.ticker)
  if (!sym) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }

  const sb = createClient(supabaseUrl, serviceKey)
  const action = body.action === 'save' ? 'save' : 'load'

  if (action === 'load') {
    const { data, error } = await sb
      .from('company_moat_summaries')
      .select('symbol, body, how_they_make_money_body, recent_deals_body, content_source')
      .eq('symbol', sym)
      .maybeSingle()

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    if (!data) {
      res.status(200).json({
        exists: false,
        symbol: sym,
        body: '',
        how_they_make_money_body: '',
        recent_deals_body: '',
        content_source: null,
      })
      return
    }

    res.status(200).json({
      exists: true,
      symbol: data.symbol,
      body: typeof data.body === 'string' ? data.body : '',
      how_they_make_money_body:
        typeof data.how_they_make_money_body === 'string' ? data.how_they_make_money_body : '',
      recent_deals_body: typeof data.recent_deals_body === 'string' ? data.recent_deals_body : '',
      content_source: typeof data.content_source === 'string' ? data.content_source : null,
    })
    return
  }

  const moatBody = typeof body.body === 'string' ? body.body.trim() : ''
  if (!moatBody) {
    res.status(400).json({ error: "What's the moat (body) is required and cannot be empty." })
    return
  }

  const howRaw =
    typeof body.how_they_make_money_body === 'string' ? body.how_they_make_money_body.trim() : ''
  const dealsRaw = typeof body.recent_deals_body === 'string' ? body.recent_deals_body.trim() : ''

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
