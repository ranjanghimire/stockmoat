/**
 * Apply pilot editorial copy to five symbols (force overwrite all three fields).
 *
 *   npm run pilot:editorial
 *
 * Symbols: ADTX, AEHL, AGLE, PLTR, SAVA
 */
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { pilotEditorialForSymbol } from '../src/lib/editorial/pilotEditorialTexts'

loadDotenv({ path: '.env.local' })
loadDotenv()

const PILOT_SYMBOLS = ['ADTX', 'AEHL', 'AGLE', 'PLTR', 'SAVA'] as const

function env(name: string): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

async function main(): Promise<void> {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const sb = createClient(url, key)
  const updated: string[] = []

  for (const sym of PILOT_SYMBOLS) {
    const gen = pilotEditorialForSymbol(sym)
    if (!gen) {
      console.warn(`No pilot text for ${sym}`)
      continue
    }

    const { error } = await sb.from('company_moat_summaries').upsert(
      {
        symbol: sym,
        body: gen.moatBody,
        how_they_make_money_body: gen.howTheyMakeMoneyBody,
        recent_deals_body: gen.recentDealsBody,
        content_source: 'auto_generated',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'symbol' },
    )

    if (error) {
      console.error(`${sym}: ${error.message}`)
      continue
    }
    updated.push(sym)
    console.log(`OK ${sym}`)
  }

  console.log(`\nPilot complete. Updated ${updated.length} row(s): ${updated.join(', ')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
