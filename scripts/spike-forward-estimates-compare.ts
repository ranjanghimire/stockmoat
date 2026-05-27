/**
 * Compare FMP analyst-estimates vs Gemini forward consensus for tickers.
 *
 * Usage (from repo root, with .env.local):
 *   npm run spike:forward -- META AAPL PLTR
 *   (requires `npm install` so node_modules/vite-node exists)
 *
 * Env: fmpApiKey or FMP_API_KEY; optional GEMINI_API_KEY for fallback comparison.
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { buildCompanyFacts } from '../src/lib/fmp/buildCompanyFacts'
import { fetchCompanyRawPack } from '../src/lib/fmp/fetchCompanyRawPack'
import { formatForwardEstimatesBlock } from '../src/lib/fmp/parseForwardEstimates'
import { compareForwardSeries, summarizeCompare } from '../src/lib/forwardEstimates/compareForwardEstimates'
import { fetchGeminiForwardEstimates } from '../src/lib/forwardEstimates/fetchGeminiForwardEstimates'
import {
  lastActualFiscalYearFromIncome,
  parseForwardEstimatesFromFmp,
} from '../src/lib/fmp/parseForwardEstimates'
import { resolveForwardEstimates } from '../src/lib/forwardEstimates/resolveForwardEstimates'

function envKey(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n]?.trim()
    if (v) return v
  }
  return ''
}

const fmpKey = envKey('fmpApiKey', 'FMP_API_KEY', 'VITE_FMP_API_KEY')
const geminiKey = envKey('GEMINI_API_KEY')

const tickers = process.argv.slice(2).map((t) => t.toUpperCase())
if (tickers.length === 0) tickers.push('META', 'AAPL', 'PLTR')

async function main() {
  if (!fmpKey) {
    console.error('Missing fmpApiKey / FMP_API_KEY in .env.local')
    process.exit(1)
  }

  console.log('Forward estimates spike: FMP vs Gemini')
  console.log(`Tickers: ${tickers.join(', ')}`)
  console.log(`Gemini: ${geminiKey ? 'enabled' : 'skipped (no GEMINI_API_KEY)'}\n`)

  for (const sym of tickers) {
    console.log('═'.repeat(60))
    console.log(sym)
    console.log('═'.repeat(60))

    const pack = await fetchCompanyRawPack(sym, fmpKey)
    const facts = buildCompanyFacts(sym, pack)
    const lastActual = lastActualFiscalYearFromIncome(pack.incomeAnnual)
    console.log(`Company: ${facts.companyName} | Last actual FY (income[0]): ${lastActual ?? 'n/a'}`)
    console.log(`Pack analyst-estimates rows: ${pack.analystEstimates.length}`)

    const fmpSeries = parseForwardEstimatesFromFmp(sym, pack.analystEstimates, {
      maxYears: 3,
      lastActualFiscalYear: lastActual,
    })

    const resolved = await resolveForwardEstimates(sym, pack, facts, {
      fmpApiKey: fmpKey,
      geminiApiKey: geminiKey || undefined,
      estimateLimit: 10,
    })

    console.log('\n--- FMP (parsed, forward-only) ---')
    console.log(formatForwardEstimatesBlock(facts.companyName, fmpSeries))
    console.log(JSON.stringify(fmpSeries, null, 2))

    if (geminiKey) {
      try {
        const geminiSeries = await fetchGeminiForwardEstimates(sym, facts.companyName, geminiKey, {
          lastActualFiscalYear: lastActual,
        })
        console.log('\n--- Gemini (JSON → series) ---')
        console.log(formatForwardEstimatesBlock(facts.companyName, geminiSeries))
        console.log(JSON.stringify(geminiSeries, null, 2))

        const cmp = compareForwardSeries(fmpSeries, geminiSeries)
        const sum = summarizeCompare(cmp)
        console.log('\n--- Comparison (FMP vs Gemini) ---')
        for (const row of cmp) {
          const label = row.metric === 'revenue' ? 'Rev' : 'EPS'
          const fmpV = row.fmp ?? NaN
          const gV = row.gemini ?? NaN
          const diff =
            row.pctDiff !== undefined ? ` (${row.pctDiff >= 0 ? '+' : ''}${row.pctDiff.toFixed(2)}%)` : ''
          console.log(
            `  FY${row.fiscalYear} ${label}: FMP=${row.metric === 'revenue' ? fmpV / 1e9 : fmpV}${row.metric === 'revenue' ? 'B' : ''}  Gemini=${row.metric === 'revenue' ? gV / 1e9 : gV}${row.metric === 'revenue' ? 'B' : ''}${diff}`,
          )
        }
        console.log(
          `  Summary: rev ${sum.revenueMatches}/${sum.revenueCompared} within 3%, eps ${sum.epsMatches}/${sum.epsCompared} within 3%, max |Δ|=${sum.maxAbsPctDiff.toFixed(2)}%`,
        )
      } catch (e) {
        console.error('Gemini error:', e instanceof Error ? e.message : e)
      }
    }

    if (resolved) {
      console.log(`\n--- Resolver (production path) ---`)
      console.log(`Source: ${resolved.series.source} | Gemini fallback used: ${resolved.usedGeminiFallback}`)
      console.log(formatForwardEstimatesBlock(facts.companyName, resolved.series))
    } else {
      console.log('\n--- Resolver: no usable series ---')
    }

    console.log('')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
