/**
 * Integration tests against live FMP (requires API key).
 *
 * Loads `fmpApiKey` or `VITE_FMP_API_KEY` from `.env.local` via Vite's loadEnv
 * (development mode so local env files apply). Alternatively set `FMP_API_KEY`
 * in the shell when running CI.
 *
 *   npm run test:integration
 */
import { loadEnv } from 'vite'
import { describe, expect, it } from 'vitest'
import { buildCompanyFacts } from './buildCompanyFacts'
import { fetchCompanyRawPack } from './fetchCompanyRawPack'
import { fetchPeerMedians } from './peerMedians'
import { createLiveMetricEvaluator } from '../liveMetricEvaluator'
import type { ProfileMetricDef } from '../../types/sectorProfiles'

const devEnv = loadEnv('development', process.cwd(), '')
const fmpApiKey = (
  devEnv.fmpApiKey ??
  devEnv.VITE_FMP_API_KEY ??
  process.env.FMP_API_KEY ??
  ''
).trim()

const evGpMetric: ProfileMetricDef = {
  id: 'ev_to_gross_profit_vs_peer',
  pillar: 'valuation',
  pillar_weight: 0.14,
  mode: 'score',
  peer_relative: true,
}

describe.skipIf(!fmpApiKey)('FMP peer EV / gross profit (integration)', () => {
  const apiKey = fmpApiKey

  it('fetchPeerMedians returns a positive EV/gross profit median for MSFT peers', async () => {
    const pack = await fetchCompanyRawPack('MSFT', apiKey)
    const medians = await fetchPeerMedians(pack.peers, apiKey, { subjectSymbol: 'MSFT' })

    expect(medians.n).toBeGreaterThan(0)
    expect(medians.enterpriseValueToGrossProfit).toBeDefined()
    expect(Number.isFinite(medians.enterpriseValueToGrossProfit)).toBe(true)
    expect(medians.enterpriseValueToGrossProfit!).toBeGreaterThan(0)
  })

  it('live evaluator shows peer median for MSFT (not unavailable)', async () => {
    const pack = await fetchCompanyRawPack('MSFT', apiKey)
    const facts = buildCompanyFacts('MSFT', pack)
    const medians = await fetchPeerMedians(pack.peers, apiKey, { subjectSymbol: 'MSFT' })
    const snapshot = medians.n > 0 ? medians : null

    expect(snapshot?.enterpriseValueToGrossProfit).toBeDefined()
    expect(facts.enterpriseValueToGrossProfit).toBeDefined()
    expect(facts.enterpriseValueToGrossProfit!).toBeGreaterThan(0)

    const evaluate = createLiveMetricEvaluator('MSFT', facts, snapshot)
    const ev = evaluate(evGpMetric)
    expect(ev.displayValue).toContain('vs peer median')
    expect(ev.displayValue).not.toContain('peer median unavailable')
  })

  it('same for AAPL', async () => {
    const pack = await fetchCompanyRawPack('AAPL', apiKey)
    const facts = buildCompanyFacts('AAPL', pack)
    const medians = await fetchPeerMedians(pack.peers, apiKey, { subjectSymbol: 'AAPL' })
    const snapshot = medians.n > 0 ? medians : null

    expect(snapshot?.enterpriseValueToGrossProfit).toBeDefined()
    expect(snapshot!.enterpriseValueToGrossProfit!).toBeGreaterThan(0)

    const evaluate = createLiveMetricEvaluator('AAPL', facts, snapshot)
    const ev = evaluate(evGpMetric)
    expect(ev.displayValue).toContain('vs peer median')
    expect(ev.displayValue).not.toContain('peer median unavailable')
  })
})
