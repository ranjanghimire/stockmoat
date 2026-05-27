import { describe, expect, it } from 'vitest'

import { buildMetricInterpretation, buildValuationSummary, subscoreToVerdict, verdictLabel } from './buildInterpretation'
import type { MetricEval } from '../mockMetricDriver'

describe('buildMetricInterpretation', () => {
  it('maps subscore to verdict bands', () => {
    expect(verdictLabel(subscoreToVerdict(0.9))).toBe('Strong')
    expect(verdictLabel(subscoreToVerdict(0.45))).toBe('Weak')
  })

  it('builds peer-relative headline and meter for EV/EBIT vs peers', () => {
    const ev: MetricEval = {
      id: 'ev_to_ebit_vs_peer',
      subscore: 0.35,
      gatePass: true,
      displayValue: 'EV/EBIT: 137.61 vs peer median 41.69',
      hints: { subjectValue: 137.61, peerMedian: 41.69 },
    }
    const i = buildMetricInterpretation('ev_to_ebit_vs_peer', ev, {
      mode: 'score',
      peer_relative: true,
    })
    expect(i.verdict).toBe('weak')
    expect(i.formattedValue).toContain('137.61')
    expect(i.formattedValue).toContain('41.69')
    expect(i.meterPosition).toBeLessThan(0.25)
    expect(i.headline.toLowerCase()).toMatch(/expensive|peer/)
  })

  it('formats ROIC as percent in peer comparison', () => {
    const ev: MetricEval = {
      id: 'roic_vs_peer',
      subscore: 0.55,
      gatePass: true,
      displayValue: 'ROIC: 0.07 vs peer median 0.12',
      hints: { subjectValue: 0.07, peerMedian: 0.12 },
    }
    const i = buildMetricInterpretation('roic_vs_peer', ev, {
      mode: 'score',
      peer_relative: true,
    })
    expect(i.formattedValue).toContain('7.00%')
    expect(i.peerFormatted).toContain('12.00%')
  })

  it('builds PEG absolute-band interpretation', () => {
    const ev: MetricEval = {
      id: 'peg_ttm',
      subscore: 1,
      gatePass: true,
      displayValue: '0.01',
      hints: { absoluteValue: 0.01, valueUnit: 'multiple' },
    }
    const i = buildMetricInterpretation('peg_ttm', ev, {
      mode: 'score',
    })
    expect(i.formattedValue).toBe('0.01×')
    expect(i.meterPosition).toBeGreaterThan(0.9)
  })
})

describe('buildValuationSummary', () => {
  it('includes trailing P/E with sector band headline', () => {
    const summary = buildValuationSummary(
      {
        symbol: 'TEST',
        companyName: 'Test',
        sector: 'Technology',
        industry: 'Semis',
        annualEps: [],
        annualGrossMargin: [],
        annualRevenue: [],
        annualEfficiencyRatio: [],
        peTrailing: 28,
        pegRatio: 1.1,
      },
      null,
      'Technology',
    )
    expect(summary.lines.some((l) => l.id === 'pe_trailing')).toBe(true)
    const pe = summary.lines.find((l) => l.id === 'pe_trailing')!
    expect(pe.interpretation.headline).toMatch(/P\/E|28/)
  })
})
