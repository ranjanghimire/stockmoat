import type { SupabaseClient } from '@supabase/supabase-js'

export interface NightlyDbContext {
  /** symbol -> ISO updated_at from screen_scores */
  scoreUpdatedAt: Map<string, string>
  /** symbol -> latest moat copy (may be empty strings if columns blank) */
  moatBodies: Map<string, { body: string; how: string }>
  /** Distinct symbols seen in home FMP cache (Edge writes). */
  homeCacheSymbols: Set<string>
}

async function fetchAllRows<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  select: string,
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const out: T[] = []
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const chunk = (data ?? []) as unknown as T[]
    out.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return out
}

/**
 * Loads maps needed for nightly prioritization (service-role Supabase client).
 */
export async function fetchNightlyDbContext(supabase: SupabaseClient): Promise<NightlyDbContext> {
  const scoreRows = await fetchAllRows<{ symbol: string; updated_at: string }>(
    supabase,
    'screen_scores',
    'symbol,updated_at',
  )
  const scoreUpdatedAt = new Map<string, string>()
  for (const r of scoreRows) {
    const s = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
    if (!s) continue
    scoreUpdatedAt.set(s, r.updated_at)
  }

  const moatRows = await fetchAllRows<{
    symbol: string
    body: string | null
    how_they_make_money_body: string | null
  }>(supabase, 'company_moat_summaries', 'symbol,body,how_they_make_money_body')
  const moatBodies = new Map<string, { body: string; how: string }>()
  for (const r of moatRows) {
    const s = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
    if (!s) continue
    moatBodies.set(s, {
      body: typeof r.body === 'string' ? r.body : '',
      how: typeof r.how_they_make_money_body === 'string' ? r.how_they_make_money_body : '',
    })
  }

  const cacheRows = await fetchAllRows<{ symbol: string }>(supabase, 'ticker_fmp_home_cache', 'symbol')
  const homeCacheSymbols = new Set<string>()
  for (const r of cacheRows) {
    const s = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
    if (s) homeCacheSymbols.add(s)
  }

  return { scoreUpdatedAt, moatBodies, homeCacheSymbols }
}
