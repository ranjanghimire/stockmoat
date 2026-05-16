import { isGenericRecentDealsFiller } from './recentDealsOverrides'

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

/**
 * Server-side checks before writing sheet-sourced Gemini output to `company_moat_summaries`.
 */
export function validateMoatSheetUpsert(fields: MoatSheetUpsertFields): { ok: true } | { ok: false; reason: string } {
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
