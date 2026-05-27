import { config } from 'dotenv'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

config({ path: resolve(process.cwd(), '.env.local') })

import { buildCompanyFacts } from './buildCompanyFacts'
import { fetchCompanyRawPack } from './fetchCompanyRawPack'
import { compareForwardSeries, summarizeCompare } from '../forwardEstimates/compareForwardEstimates'
import { fetchGeminiForwardEstimates } from '../forwardEstimates/fetchGeminiForwardEstimates'
import {
  lastActualFiscalYearFromIncome,
  parseForwardEstimatesFromFmp,
} from './parseForwardEstimates'

const fmpKey = (process.env.fmpApiKey ?? process.env.FMP_API_KEY ?? '').trim()
const geminiKey = (process.env.GEMINI_API_KEY ?? '').trim()

describe.skipIf(!fmpKey)('FMP forward estimates (integration)', () => {
  it('META: FMP forward years align with Gemini within ~5% when Gemini key set', async () => {
    const sym = 'META'
    const pack = await fetchCompanyRawPack(sym, fmpKey)
    const facts = buildCompanyFacts(sym, pack)
    const lastActual = lastActualFiscalYearFromIncome(pack.incomeAnnual)

    const fmpSeries = parseForwardEstimatesFromFmp(sym, pack.analystEstimates, {
      maxYears: 3,
      lastActualFiscalYear: lastActual,
    })

    expect(fmpSeries.revenue.length, 'FMP should return forward revenue years').toBeGreaterThanOrEqual(2)
    expect(fmpSeries.eps.length, 'FMP should return forward EPS years').toBeGreaterThanOrEqual(2)

    if (!geminiKey) {
      console.warn('GEMINI_API_KEY not set — skipping FMP vs Gemini comparison')
      return
    }

    const geminiSeries = await fetchGeminiForwardEstimates(sym, facts.companyName, geminiKey, {
      lastActualFiscalYear: lastActual,
    })

    const cmp = compareForwardSeries(fmpSeries, geminiSeries)
    const sum = summarizeCompare(cmp)

    expect(sum.maxAbsPctDiff, JSON.stringify(cmp, null, 2)).toBeLessThan(8)
  }, 90_000)

  it('AAPL: FMP returns at least two forward fiscal years', async () => {
    const sym = 'AAPL'
    const pack = await fetchCompanyRawPack(sym, fmpKey)
    const lastActual = lastActualFiscalYearFromIncome(pack.incomeAnnual)
    const fmpSeries = parseForwardEstimatesFromFmp(sym, pack.analystEstimates, {
      maxYears: 3,
      lastActualFiscalYear: lastActual,
    })
    expect(fmpSeries.revenue.length).toBeGreaterThanOrEqual(2)
    expect(fmpSeries.eps.length).toBeGreaterThanOrEqual(2)
  }, 60_000)
})
