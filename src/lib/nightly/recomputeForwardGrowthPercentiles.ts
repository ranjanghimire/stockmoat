import type { SupabaseClient } from '@supabase/supabase-js'
import { percentileForwardGrowthScores } from '../fmp/forwardRevenueGrowthScore'

const PAGE_SIZE = 1000

/**
 * Re-rank `forward_growth_score` (1–10) from `forward_rev_cagr_3y` across every row in `screen_scores`.
 * Symbols without CAGR get `forward_growth_score = null`.
 */
export async function recomputeForwardGrowthPercentiles(sb: SupabaseClient): Promise<{
  ranked: number
  cleared: number
}> {
  const cagrEntries: Array<{ symbol: string; cagr: number }> = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('screen_scores')
      .select('symbol, forward_rev_cagr_3y')
      .not('forward_rev_cagr_3y', 'is', null)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const batch = data ?? []
    for (const row of batch) {
      const sym = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : ''
      const cagr = row.forward_rev_cagr_3y
      if (sym && typeof cagr === 'number' && Number.isFinite(cagr)) {
        cagrEntries.push({ symbol: sym, cagr })
      }
    }
    if (batch.length < PAGE_SIZE) break
  }

  const scoreBySymbol = percentileForwardGrowthScores(cagrEntries)
  let updated = 0

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('screen_scores')
      .select('symbol, forward_rev_cagr_3y')
      .order('symbol', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const batch = data ?? []
    if (batch.length === 0) break

    const updates = batch.map((row) => {
      const sym = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : ''
      const cagr = row.forward_rev_cagr_3y
      const hasCagr = typeof cagr === 'number' && Number.isFinite(cagr)
      const score = hasCagr ? (scoreBySymbol.get(sym) ?? null) : null
      return { symbol: sym, forward_growth_score: score }
    })

    const { error: upErr } = await sb.from('screen_scores').upsert(updates, { onConflict: 'symbol' })
    if (upErr) throw new Error(upErr.message)
    updated += batch.length

    if (batch.length < PAGE_SIZE) break
  }

  return { ranked: cagrEntries.length, cleared: updated - cagrEntries.length }
}
