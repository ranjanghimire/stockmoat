/**
 * Inspect FMP analyst-estimates forward consensus for tickers.
 *
 * Usage (from repo root, with .env.local):
 *   npm run spike:forward -- META AAPL PLTR
 *
 * Optional Gemini comparison (dev only, not used in product):
 *   npm run spike:forward -- --compare-gemini META
 *
 * Env: fmpApiKey or FMP_API_KEY; GEMINI_API_KEY only with --compare-gemini.
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { buildCompanyFacts } from '../src/lib/fmp/buildCompanyFacts'
import { fetchCompanyRawPack } from '../src/lib/fmp/fetchCompanyRawPack'
import {
  buildForwardGrowthChartsFromPack,
  formatForwardEstimatesBlock,
  lastActualFiscalYearFromIncome,
  parseForwardEstimatesFromFmp,
} from '../src/lib/fmp/parseForwardEstimates'
import { compareForwardSeries, summarizeCompare } from '../src/lib/forwardEstimates/compareForwardEstimates'
import { fetchGeminiForwardEstimates } from '../src/lib/forwardEstimates/fetchGeminiForwardEstimates'
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
const geminiModel = envKey('GEMINI_MODEL') || undefined

const rawArgs = process.argv.slice(2)
const compareGemini = rawArgs.includes('--compare-gemini')
const tickers = rawArgs.filter((a) => !a.startsWith('--')).map((t) => t.toUpperCase())
if (tickers.length === 0) tickers.push('META', 'AAPL', 'PLTR')

async function main() {
  if (!fmpKey) {
    console.error('Missing fmpApiKey / FMP_API_KEY in .env.local')
    process.exit(1)
  }

  console.log('Forward estimates spike (FMP production path)')
  console.log(`Tickers: ${tickers.join(', ')}`)
  if (compareGemini) {
    console.log(`Gemini compare: ${geminiKey ? 'enabled' : 'skipped (no GEMINI_API_KEY)'}`)
  }
  console.log('')

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

    const resolved = await resolveForwardEstimates(sym, pack, { fmpApiKey: fmpKey, estimateLimit: 10 })
    const charts = buildForwardGrowthChartsFromPack(sym, pack.analystEstimates, pack.incomeAnnual)

    console.log('\n--- FMP (parsed, forward-only) ---')
    console.log(formatForwardEstimatesBlock(facts.companyName, fmpSeries))
    console.log(JSON.stringify(fmpSeries, null, 2))

    if (compareGemini && geminiKey) {
      try {
        const geminiSeries = await fetchGeminiForwardEstimates(sym, facts.companyName, geminiKey, {
          lastActualFiscalYear: lastActual,
          model: geminiModel,
        })
        console.log('\n--- Gemini (dev compare only; not used in app) ---')
        console.log(formatForwardEstimatesBlock(facts.companyName, geminiSeries))
        console.log(JSON.stringify(geminiSeries, null, 2))

        const cmp = compareForwardSeries(fmpSeries, geminiSeries)
        const sum = summarizeCompare(cmp)
        console.log('\n--- Comparison (FMP vs Gemini) ---')
        for (const row of cmp) {
          const label = row.metric === 'revenue' ? 'Rev' : 'EPS'
          const fmpV = row.fmp
          const gV = row.gemini
          const diff =
            row.pctDiff !== undefined ? ` (${row.pctDiff >= 0 ? '+' : ''}${row.pctDiff.toFixed(2)}%)` : ''
          const fmtFmp =
            fmpV !== undefined
              ? row.metric === 'revenue'
                ? `${fmpV / 1e9}B`
                : String(fmpV)
              : 'n/a'
          const fmtGem =
            gV !== undefined
              ? row.metric === 'revenue'
                ? `${gV / 1e9}B`
                : String(gV)
              : 'n/a'
          console.log(`  FY${row.fiscalYear} ${label}: FMP=${fmtFmp}  Gemini=${fmtGem}${diff}`)
        }
        console.log(
          `  Summary: rev ${sum.revenueMatches}/${sum.revenueCompared} within 3%, eps ${sum.epsMatches}/${sum.epsCompared} within 3%, max |Δ|=${sum.maxAbsPctDiff.toFixed(2)}%`,
        )
      } catch (e) {
        console.error('Gemini error:', e instanceof Error ? e.message : e)
      }
    }

    if (resolved) {
      console.log('\n--- Resolver (FMP-only, same as Home) ---')
      console.log(`Source: ${resolved.series.source}`)
      console.log(formatForwardEstimatesBlock(facts.companyName, resolved.series))
      if (charts) {
        console.log(`Chart points: ${charts.points.map((p) => p.label).join(', ')}`)
      }
    } else {
      console.log('\n--- Resolver: no forward estimates ---')
    }

    console.log('')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
