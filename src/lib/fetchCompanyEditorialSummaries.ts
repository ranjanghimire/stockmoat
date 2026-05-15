import { RECENT_DEALS_OVERRIDES, isGenericRecentDealsFiller } from './editorial/recentDealsOverrides'
import { getSupabaseBrowserClient } from './supabaseClient'

export interface CompanyEditorialSummaries {
  moatBody: string | null
  howTheyMakeMoneyBody: string | null
  recentDealsBody: string | null
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

const empty: CompanyEditorialSummaries = {
  moatBody: null,
  howTheyMakeMoneyBody: null,
  recentDealsBody: null,
}

/**
 * Loads moat, revenue, and recent-deals copy from `company_moat_summaries`.
 * Returns null bodies when Supabase is not configured, on error, or when no row / empty fields.
 */
export async function fetchCompanyEditorialSummaries(symbol: string): Promise<CompanyEditorialSummaries> {
  const sb = getSupabaseBrowserClient()
  if (!sb) return { ...empty }
  const sym = symbol.trim().toUpperCase()
  if (!sym) return { ...empty }

  const { data, error } = await sb
    .from('company_moat_summaries')
    .select('body, how_they_make_money_body, recent_deals_body')
    .eq('symbol', sym)
    .maybeSingle()

  if (error || !data) return { ...empty }

  let recentDealsBody = trimOrNull(data.recent_deals_body)
  const dealsOverride = RECENT_DEALS_OVERRIDES[sym]
  if (dealsOverride) recentDealsBody = dealsOverride
  else if (recentDealsBody && isGenericRecentDealsFiller(recentDealsBody)) recentDealsBody = null

  return {
    moatBody: trimOrNull(data.body),
    howTheyMakeMoneyBody: trimOrNull(data.how_they_make_money_body),
    recentDealsBody,
  }
}
