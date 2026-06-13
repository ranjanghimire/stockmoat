import { getProfileConfig } from '../loadFairValueConfig'
import { fairMultiple, fairYield } from '../core/fairMultiple'
import { evToPricePerShare, fcfYieldToPrice, peToPrice } from '../core/evBridge'
import type {
  FairValueBuildContext,
  FairValueMethodId,
  FairValueMethodResult,
  FairValueProfileId,
} from '../types'
import { projectNetDebtForward } from '../buildContext'

function skipped(methodId: FairValueMethodId, weight: number, reason: string): FairValueMethodResult {
  return {
    methodId,
    status: 'skipped',
    weight,
    effectiveWeight: 0,
    qualityMultiplier: 1,
    notes: [reason],
  }
}

function anchorFor(profileId: FairValueProfileId, key: string): number {
  const cfg = getProfileConfig(profileId)
  return cfg.sector_anchors[key] ?? 1
}

function peerN(ctx: FairValueBuildContext): number {
  return ctx.input.peers?.n ?? 0
}

function q(ctx: FairValueBuildContext): number {
  return ctx.qualityMultiplier
}

export function runEvGrossProfit(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const gp = operating.grossProfitTtm
  if (gp === undefined || gp <= 0) {
    return skipped('ev_gross_profit', weight, 'Gross profit unavailable or non-positive')
  }
  const base = fairMultiple(
    input.peers?.enterpriseValueToGrossProfit,
    anchorFor(input.profileId, 'ev_gross_profit'),
    peerN(ctx),
  )
  const mult = base * q(ctx)
  const fairEv = gp * mult
  const cfv = evToPricePerShare(fairEv, operating.netDebt, operating.shares)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.revenueUsd !== undefined && operating.grossMargin !== undefined) {
    const gp2 = ctx.forwardFy2.revenueUsd * operating.grossMargin
    const nd2 = projectNetDebtForward(operating.netDebt, operating.fcfTtm, operating.fcfTtm)
    ffv2 = evToPricePerShare(gp2 * mult, nd2, operating.shares)
  }

  return {
    methodId: 'ev_gross_profit',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairMultiple: mult,
    qualityMultiplier: q(ctx),
    notes: [`EV/GP fair ${mult.toFixed(1)}× on GP $${(gp / 1e9).toFixed(2)}B`],
  }
}

export function runEvRevenue(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const rev = operating.revenueTtm
  if (rev <= 0) return skipped('ev_revenue', weight, 'Revenue non-positive')

  let base = fairMultiple(
    input.peers?.enterpriseValueToRevenue,
    anchorFor(input.profileId, 'ev_revenue'),
    peerN(ctx),
  )

  const revGrowth =
    input.facts.annualRevenue.length >= 2 && input.facts.annualRevenue[1]! > 0
      ? ((input.facts.annualRevenue[0]! - input.facts.annualRevenue[1]!) / input.facts.annualRevenue[1]!) * 100
      : undefined
  if (revGrowth !== undefined && revGrowth > 15) {
    const boost = Math.min(0.25, 0.4 * Math.max(0, (revGrowth - 15) / 15))
    base *= 1 + boost
  }

  const mult = base * q(ctx)
  const cfv = evToPricePerShare(rev * mult, operating.netDebt, operating.shares)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.revenueUsd !== undefined) {
    const nd2 = projectNetDebtForward(operating.netDebt, operating.fcfTtm, operating.fcfTtm)
    ffv2 = evToPricePerShare(ctx.forwardFy2.revenueUsd * mult, nd2, operating.shares)
  }

  return {
    methodId: 'ev_revenue',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairMultiple: mult,
    qualityMultiplier: q(ctx),
    notes: [`EV/Rev fair ${mult.toFixed(1)}×`],
  }
}

export function runEvEbitda(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const ebitda = operating.ebitdaTtm
  if (ebitda === undefined || ebitda <= 0) {
    return skipped('ev_ebitda', weight, 'EBITDA unavailable or non-positive')
  }
  const base = fairMultiple(input.peers?.evToEbitda, anchorFor(input.profileId, 'ev_ebitda'), peerN(ctx))
  const mult = base * q(ctx)
  const cfv = evToPricePerShare(ebitda * mult, operating.netDebt, operating.shares)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.revenueUsd !== undefined && operating.ebitdaMargin !== undefined) {
    const ebitda2 = ctx.forwardFy2.revenueUsd * operating.ebitdaMargin
    const nd2 = projectNetDebtForward(operating.netDebt, operating.fcfTtm, operating.fcfTtm)
    ffv2 = evToPricePerShare(ebitda2 * mult, nd2, operating.shares)
  }

  return {
    methodId: 'ev_ebitda',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairMultiple: mult,
    qualityMultiplier: q(ctx),
    notes: [`EV/EBITDA fair ${mult.toFixed(1)}× (normalized EBITDA)`],
  }
}

export function runEvEbit(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const ebit = operating.ebitTtm
  if (ebit === undefined || ebit <= 0) {
    return skipped('ev_ebit', weight, 'EBIT unavailable or non-positive')
  }
  const base = fairMultiple(input.peers?.evToEbit, anchorFor(input.profileId, 'ev_ebit'), peerN(ctx))
  const mult = base * q(ctx)
  const cfv = evToPricePerShare(ebit * mult, operating.netDebt, operating.shares)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.revenueUsd !== undefined && operating.ebitdaMargin !== undefined && operating.ebitToEbitdaRatio) {
    const ebit2 = ctx.forwardFy2.revenueUsd * operating.ebitdaMargin * operating.ebitToEbitdaRatio
    const nd2 = projectNetDebtForward(operating.netDebt, operating.fcfTtm, operating.fcfTtm)
    ffv2 = evToPricePerShare(ebit2 * mult, nd2, operating.shares)
  }

  return {
    methodId: 'ev_ebit',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairMultiple: mult,
    qualityMultiplier: q(ctx),
    notes: [`EV/EBIT fair ${mult.toFixed(1)}×`],
  }
}

export function runFcfYieldPeer(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const fcf = operating.fcfTtm
  if (fcf === undefined || fcf <= 0) {
    return skipped('fcf_yield_peer', weight, 'FCF unavailable or non-positive')
  }
  const baseYield = fairYield(input.peers?.fcfYield, anchorFor(input.profileId, 'fcf_yield'), peerN(ctx))
  const fairY = baseYield / q(ctx)
  const cfv = fcfYieldToPrice(fcf, fairY, operating.shares)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.revenueUsd !== undefined && operating.fcfToRevenue !== undefined) {
    const fcf2 = ctx.forwardFy2.revenueUsd * operating.fcfToRevenue
    ffv2 = fcfYieldToPrice(fcf2, fairY, operating.shares)
  }

  return {
    methodId: 'fcf_yield_peer',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairYield: fairY,
    qualityMultiplier: q(ctx),
    notes: [`FCF yield fair ${(fairY * 100).toFixed(2)}%`],
  }
}

export function runFcfYieldOwn5y(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const fcf = operating.fcfTtm
  const rev = operating.revenueTtm
  const ownMed = input.facts.fcfToRevenueMedian5y
  const peerYield = input.peers?.fcfYield ?? anchorFor(input.profileId, 'fcf_yield')

  if (fcf === undefined || fcf <= 0 || ownMed === undefined || rev <= 0) {
    return skipped('fcf_yield_own_5y', weight, 'FCF own-history proxy unavailable')
  }

  const fairFcfRev = ownMed * q(ctx)
  const fairFcf = rev * fairFcfRev
  const fairY = peerYield > 0 ? peerYield / q(ctx) : anchorFor(input.profileId, 'fcf_yield') / q(ctx)
  const cfv = fcfYieldToPrice(fairFcf, fairY, operating.shares)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.revenueUsd !== undefined) {
    const fcf2 = ctx.forwardFy2.revenueUsd * fairFcfRev
    ffv2 = fcfYieldToPrice(fcf2, fairY, operating.shares)
  }

  return {
    methodId: 'fcf_yield_own_5y',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairYield: fairY,
    qualityMultiplier: q(ctx),
    notes: ['FCF/revenue vs own 5Y median proxy'],
  }
}

export function runPegImpliedPe(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const eps = operating.epsTtm
  const pegFair = getProfileConfig(input.profileId).peg_fair ?? 1.5

  let growthPct: number | undefined
  if (input.facts.annualEps.length >= 2) {
    const e0 = input.facts.annualEps[0]!
    const e1 = input.facts.annualEps[1]!
    if (e0 > 0 && e1 > 0) growthPct = ((e0 - e1) / e1) * 100
  }
  if (growthPct === undefined && input.facts.pegRatio !== undefined && input.facts.peTrailing !== undefined) {
    growthPct = input.facts.peTrailing / input.facts.pegRatio
  }

  if (eps === undefined || eps <= 0 || growthPct === undefined || growthPct <= 0) {
    return skipped('peg_implied_pe', weight, 'PEG method needs positive EPS and growth')
  }

  const fairPe = pegFair * growthPct * q(ctx)
  const cfv = peToPrice(eps, fairPe)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.eps !== undefined && ctx.forwardFy2.eps > 0 && ctx.forwardFy1?.eps !== undefined && ctx.forwardFy1.eps > 0) {
    const gFwd = ((ctx.forwardFy2.eps - ctx.forwardFy1.eps) / ctx.forwardFy1.eps) * 100
    if (gFwd > 0) ffv2 = peToPrice(ctx.forwardFy2.eps, pegFair * gFwd * q(ctx))
  }

  return {
    methodId: 'peg_implied_pe',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairMultiple: fairPe,
    qualityMultiplier: q(ctx),
    notes: [`PEG-implied fair P/E ${fairPe.toFixed(1)}× (growth ${growthPct.toFixed(1)}%)`],
  }
}

export function runEvGrossProfitWithEbitFallback(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const gp = runEvGrossProfit(ctx, weight)
  if (gp.status === 'ok') return gp
  const ebit = runEvEbit(ctx, weight)
  if (ebit.status === 'ok') {
    return { ...ebit, status: 'fallback', notes: [...ebit.notes, 'EV/GP unavailable — used EV/EBIT fallback'] }
  }
  return gp
}

export function runPriceToBook(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const bvps = operating.bookValuePerShare
  if (bvps === undefined || bvps <= 0) {
    return skipped('price_to_book', weight, 'Book value per share unavailable')
  }
  const base = fairMultiple(input.peers?.priceToBook, anchorFor(input.profileId, 'price_to_book'), peerN(ctx))
  const mult = base * q(ctx)
  const cfv = peToPrice(bvps, mult)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.eps !== undefined && ctx.forwardFy2.eps > 0 && operating.epsTtm !== undefined && operating.epsTtm > 0) {
    const bvps2 = bvps * (ctx.forwardFy2.eps / operating.epsTtm)
    ffv2 = peToPrice(bvps2, mult)
  }

  return {
    methodId: 'price_to_book',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairMultiple: mult,
    qualityMultiplier: q(ctx),
    notes: [`Fair P/B ${mult.toFixed(2)}×`],
  }
}

export function runPriceToTangibleBook(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const tbvps = operating.tangibleBookPerShare
  if (tbvps === undefined || tbvps <= 0) {
    return skipped('price_to_tangible_book', weight, 'Tangible book per share unavailable')
  }
  const base = fairMultiple(
    undefined,
    anchorFor(input.profileId, 'price_to_tangible_book'),
    peerN(ctx),
  )
  const peerPtb = input.peers?.priceToBook
  const blended = peerPtb !== undefined && peerPtb > 0 ? (base + peerPtb) / 2 : base
  const mult = blended * q(ctx)
  const cfv = peToPrice(tbvps, mult)

  return {
    methodId: 'price_to_tangible_book',
    status: 'ok',
    cfvPerShare: cfv,
    weight,
    effectiveWeight: 0,
    fairMultiple: mult,
    qualityMultiplier: q(ctx),
    notes: [`Fair P/TBV ${mult.toFixed(2)}×`],
  }
}

export function runPFfo(ctx: FairValueBuildContext, weight: number): FairValueMethodResult {
  const { operating, input } = ctx
  const ffo = operating.ffoPerShare ?? input.facts.ffoPerShare
  if (ffo === undefined || ffo <= 0) {
    return skipped('p_ffo', weight, 'FFO per share unavailable')
  }
  const base = fairMultiple(input.peers?.priceToFfo, anchorFor(input.profileId, 'p_ffo'), peerN(ctx))
  const mult = base * q(ctx)
  const cfv = peToPrice(ffo, mult)

  let ffv2: number | undefined
  if (ctx.forwardFy2?.eps !== undefined && ctx.forwardFy2.eps > 0 && operating.epsTtm !== undefined && operating.epsTtm > 0) {
    const ffo2 = ffo * (ctx.forwardFy2.eps / operating.epsTtm)
    ffv2 = peToPrice(ffo2, mult)
  }

  return {
    methodId: 'p_ffo',
    status: 'ok',
    cfvPerShare: cfv,
    ffv2PerShare: ffv2,
    weight,
    effectiveWeight: 0,
    fairMultiple: mult,
    qualityMultiplier: q(ctx),
    notes: [`Fair P/FFO ${mult.toFixed(1)}×`],
  }
}

const RUNNERS: Record<
  FairValueMethodId,
  (ctx: FairValueBuildContext, weight: number) => FairValueMethodResult
> = {
  ev_gross_profit: runEvGrossProfitWithEbitFallback,
  ev_revenue: runEvRevenue,
  ev_ebitda: runEvEbitda,
  ev_ebit: runEvEbit,
  fcf_yield_peer: runFcfYieldPeer,
  fcf_yield_own_5y: runFcfYieldOwn5y,
  peg_implied_pe: runPegImpliedPe,
  pe_trailing: () => skipped('pe_trailing', 0, 'Not used in v1'),
  price_to_book: runPriceToBook,
  price_to_tangible_book: runPriceToTangibleBook,
  p_ffo: runPFfo,
}

export function runMethod(
  methodId: FairValueMethodId,
  ctx: FairValueBuildContext,
  weight: number,
): FairValueMethodResult {
  return RUNNERS[methodId](ctx, weight)
}
