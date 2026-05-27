import { describe, expect, it } from 'vitest'

import {
  extractJsonObjectString,
  normalizeGeminiForwardPayload,
  parseGeminiForwardJsonText,
} from './parseGeminiForwardJson'

describe('parseGeminiForwardJson', () => {
  it('parses JSON inside markdown fences', () => {
    const text = '```json\n{"revenue":[{"fy":2026,"value_usd":253080000000}],"eps":[{"fy":2026,"value":32.32}]}\n```'
    const j = parseGeminiForwardJsonText(text)
    expect(j.revenue[0]?.value_usd).toBe(253080000000)
    expect(j.eps[0]?.value).toBeCloseTo(32.32)
  })

  it('normalizes revenue given in billions as a small number', () => {
    const j = normalizeGeminiForwardPayload({
      revenue: [{ fy: 2026, value: 252.84 }],
      eps: [{ fy: 2026, value: 32.32 }],
    })
    expect(j.revenue[0]?.value_usd).toBeCloseTo(252.84e9, -6)
  })

  it('extracts first balanced object from noisy text', () => {
    const inner = '{"revenue":[],"eps":[{"fy":2027,"value":9.6}]}'
    const blob = extractJsonObjectString(`Here is data: ${inner} trailing`)
    expect(blob).toBe(inner)
  })
})
