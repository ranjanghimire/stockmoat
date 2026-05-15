import { getSupabaseBrowserClient } from './supabaseClient'

/**
 * Loads curated "what's the moat?" copy from `company_moat_summaries`.
 * Returns null when Supabase is not configured, on error, or when no row exists.
 */
export async function fetchCompanyMoatSummary(symbol: string): Promise<string | null> {
  const sb = getSupabaseBrowserClient()
  if (!sb) return null
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null

  const { data, error } = await sb.from('company_moat_summaries').select('body').eq('symbol', sym).maybeSingle()

  if (error || !data || typeof data.body !== 'string') return null
  const t = data.body.trim()
  return t.length > 0 ? t : null
}
