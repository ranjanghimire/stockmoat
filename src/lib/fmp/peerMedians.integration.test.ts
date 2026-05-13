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

const evRevMetric: ProfileMetricDef = {
  id: 'ev_to_revenue_vs_peer',
  pillar: 'valuation',
  pillar_weight: 0.1,
  mode: 'score',
  peer_relative: true,
}

const fcfYieldPeerMetric: ProfileMetricDef = {
  id: 'fcf_yield_vs_peer',
  pillar: 'valuation',
  pillar_weight: 0.12,
  mode: 'score',
  peer_relative: true,
}

const evEbitMetric: ProfileMetricDef = {
  id: 'ev_to_ebit_vs_peer',
  pillar: 'valuation',
  pillar_weight: 0.1,
  mode: 'score',
  peer_relative: true,
}

describe.skipIf(!fmpApiKey)('FMP peer valuation medians (integration)', () => {
  const apiKey = fmpApiKey

  it('fetchPeerMedians returns EV/GP, EV/revenue, and FCF yield medians for MSFT peers', async () => {
    const pack = await fetchCompanyRawPack('MSFT', apiKey)
    const medians = await fetchPeerMedians(pack.peers, apiKey, { subjectSymbol: 'MSFT' })

    expect(medians.n).toBeGreaterThan(0)
    expect(medians.enterpriseValueToGrossProfit).toBeDefined()
    expect(medians.enterpriseValueToGrossProfit!).toBeGreaterThan(0)
    expect(medians.enterpriseValueToRevenue).toBeDefined()
    expect(medians.enterpriseValueToRevenue!).toBeGreaterThan(0)
    expect(medians.fcfYield).toBeDefined()
    expect(Number.isFinite(medians.fcfYield)).toBe(true)
    expect(medians.evToEbit).toBeDefined()
    expect(medians.evToEbit!).toBeGreaterThan(0)
  })

  it('live evaluator shows peer medians for MSFT EV/GP, EV/revenue, and FCF yield', async () => {
    const pack = await fetchCompanyRawPack('MSFT', apiKey)
    const facts = buildCompanyFacts('MSFT', pack)
    const medians = await fetchPeerMedians(pack.peers, apiKey, { subjectSymbol: 'MSFT' })
    const snapshot = medians.n > 0 ? medians : null

    expect(snapshot?.enterpriseValueToGrossProfit).toBeDefined()
    expect(snapshot?.enterpriseValueToRevenue).toBeDefined()
    expect(snapshot?.fcfYield).toBeDefined()
    expect(facts.enterpriseValueToGrossProfit).toBeDefined()
    expect(facts.enterpriseValueToRevenue).toBeDefined()
    expect(facts.fcfYield).toBeDefined()

    const evaluate = createLiveMetricEvaluator('MSFT', facts, snapshot)
    for (const m of [evGpMetric, evRevMetric, fcfYieldPeerMetric, evEbitMetric]) {
      const row = evaluate(m)
      expect(row.displayValue, m.id).toContain('vs peer median')
      expect(row.displayValue, m.id).not.toContain('peer median unavailable')
    }
  })

  it('same medians + display for AAPL', async () => {
    const pack = await fetchCompanyRawPack('AAPL', apiKey)
    const facts = buildCompanyFacts('AAPL', pack)
    const medians = await fetchPeerMedians(pack.peers, apiKey, { subjectSymbol: 'AAPL' })
    const snapshot = medians.n > 0 ? medians : null

    expect(snapshot?.enterpriseValueToGrossProfit).toBeDefined()
    expect(snapshot?.enterpriseValueToRevenue).toBeDefined()
    expect(snapshot?.fcfYield).toBeDefined()

    const evaluate = createLiveMetricEvaluator('AAPL', facts, snapshot)
    for (const m of [evGpMetric, evRevMetric, fcfYieldPeerMetric, evEbitMetric]) {
      const row = evaluate(m)
      expect(row.displayValue, m.id).toContain('vs peer median')
      expect(row.displayValue, m.id).not.toContain('peer median unavailable')
    }
  })
})
