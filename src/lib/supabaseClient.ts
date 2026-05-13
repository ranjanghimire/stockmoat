import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface ScreenScoreRow {
  symbol: string
  display_name: string
  score: number
  profile_id: string
  sector: string | null
  industry: string | null
  any_gate_fail: boolean
  score_cap: number | null
  raw_weighted: number | null
  updated_at: string
}

let client: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) return null
  client = createClient(url, anon)
  return client
}
