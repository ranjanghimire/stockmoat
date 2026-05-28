import { describe, expect, it } from 'vitest'
import { barHeightPercents } from './chartBarScale'

describe('barHeightPercents', () => {
  it('scales all-negative EPS from worst to best loss, not to zero', () => {
    const heights = barHeightPercents([-1.63, -0.65, -2.29, -1.95, -1.53])
    // FY2026 (-0.65) best → tallest
    expect(heights[1]).toBe(100)
    // FY2027 (-2.29) worst → shortest (floored for visibility)
    expect(heights[2]).toBeLessThan(heights[0])
    expect(heights[2]).toBe(14)
    // -1.53 better than -1.63
    expect(heights[4]).toBeGreaterThan(heights[0])
    // -1.53 better than -1.95
    expect(heights[4]).toBeGreaterThan(heights[3])
  })

  it('anchors all-positive revenue at zero', () => {
    const heights = barHeightPercents([100, 200, 300])
    expect(heights[0]).toBeGreaterThan(0)
    expect(heights[2]).toBe(100)
    expect(heights[0]).toBeLessThan(heights[1])
  })

  it('spans mixed sign without forcing extra zero padding', () => {
    const heights = barHeightPercents([-2, 1, 4])
    expect(heights[0]).toBeGreaterThan(0)
    expect(heights[2]).toBe(100)
    expect(heights[1]).toBeGreaterThan(heights[0])
    expect(heights[1]).toBeLessThan(heights[2])
  })
})
