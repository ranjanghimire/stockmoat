import { describe, expect, it } from 'vitest'
import { buildNightlySymbolPlan } from './buildNightlySymbolPlan'
import type { NightlyDbContext } from './fetchNightlyDbContext'
import {
  moatCopyMissing,
  priorityCore,
  priorityEditorial,
  priorityStale,
  priorityTotal,
  priorityTrending,
} from './nightlyPriority'

describe('nightlyPriority', () => {
  it('scores trending rank 1 above rank 100', () => {
    expect(priorityTrending(1)).toBeGreaterThan(priorityTrending(100))
  })
  it('boosts top 20 trending', () => {
    expect(priorityTrending(20)).toBeGreaterThan(priorityTrending(21))
  })
  it('stale grows with age up to cap', () => {
    expect(priorityStale(30)).toBeGreaterThan(priorityStale(10))
    expect(priorityStale(90)).toBe(priorityStale(200))
  })
  it('combines components', () => {
    const p = priorityTotal({
      symbol: 'X',
      trendingRank: 1,
      corePosition: 1,
      scoreAgeDays: 45,
      moatMissing: true,
    })
    expect(p).toBe(
      priorityTrending(1) + priorityStale(45) + priorityCore(1) + priorityEditorial(true),
    )
  })
})

describe('moatCopyMissing', () => {
  it('detects empty how', () => {
    expect(moatCopyMissing('x', '')).toBe(true)
  })
  it('detects empty body', () => {
    expect(moatCopyMissing('', 'y')).toBe(true)
  })
  it('false when both present', () => {
    expect(moatCopyMissing('a', 'b')).toBe(false)
  })
})

describe('buildNightlySymbolPlan', () => {
  const emptyDb = (): NightlyDbContext => ({
    scoreUpdatedAt: new Map(),
    moatBodies: new Map(),
    homeCacheSymbols: new Set(),
  })

  it('puts trending first within budget', () => {
    const trending = new Map([
      ['B', 2],
      ['A', 1],
    ])
    const plan = buildNightlySymbolPlan({
      budget: 10,
      staleDays: 14,
      nowMs: Date.now(),
      trendingRank: trending,
      coreOrdered: ['C', 'D'],
      db: emptyDb(),
    })
    expect(plan.symbols[0]).toBe('A')
    expect(plan.symbols[1]).toBe('B')
  })

  it('includes stale screen_scores before fresh fill', () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const db: NightlyDbContext = {
      scoreUpdatedAt: new Map([['STALE', old]]),
      moatBodies: new Map([['STALE', { body: 'm', how: 'h' }]]),
      homeCacheSymbols: new Set(),
    }
    const plan = buildNightlySymbolPlan({
      budget: 50,
      staleDays: 14,
      nowMs: Date.now(),
      trendingRank: new Map(),
      coreOrdered: ['CORE'],
      db,
    })
    expect(plan.symbols).toContain('STALE')
    expect(plan.symbols).toContain('CORE')
  })
})
