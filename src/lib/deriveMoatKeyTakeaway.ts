import type { MoatAnalysis } from './computeMoatAnalysis'
import { formatCompactUsd } from './formatCompactUsd'
import type { IncomeChartPoint } from './moatFundamentalsSnapshot'

export type TakeawayTone = 'positive' | 'negative' | 'caution' | 'neutral'

export interface KeyTakeawayLine {
  id: string
  tone: TakeawayTone
  text: string
}

export interface MoatKeyTakeawayResult {
  primary: KeyTakeawayLine | null
  secondary?: KeyTakeawayLine
}

const NEAR_ZERO_NI = 5_000_000
const RAPID_GROWTH_CAGR = 0.12
const MEANINGFUL_DECLINE_CAGR = -0.1

/**
 * Human-facing label, e.g. `Microsoft (MSFT)`.
 * Falls back to the ticker alone when the display name is missing or identical to the symbol.
 */
export function companyNameWithTicker(displayName: string | undefined, ticker: string): string {
  const sym = ticker.trim().toUpperCase()
  const raw = displayName?.trim() ?? ''
  if (!raw || raw.toUpperCase() === sym) return sym
  return `${raw} (${sym})`
}

function latestAnnualBalanceStress(fundamentals: NonNullable<MoatAnalysis['fundamentals']>): boolean {
  const yearly = fundamentals.balanceCharts?.yearly
  if (!yearly?.length) return false
  const last = yearly[yearly.length - 1]
  const a = last.totalAssets
  const l = last.totalLiabilities
  if (!Number.isFinite(a) || !Number.isFinite(l) || a <= 0) return false
  return l > a
}

function lastFiscalNetIncomeFromYearly(points: IncomeChartPoint[]): number | undefined {
  if (!points.length) return undefined
  const last = points[points.length - 1]
  return Number.isFinite(last.netIncome) ? last.netIncome : undefined
}

/** Three-year CAGR from last four annual net income points (requires oldest > 0). */
function netIncomeCagr3y(points: IncomeChartPoint[]): number | undefined {
  if (points.length < 4) return undefined
  const slice = points.slice(-4)
  const start = slice[0].netIncome
  const end = slice[3].netIncome
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return undefined
  return Math.pow(end / start, 1 / 3) - 1
}

function growthTakeawayFromYearly(
  companyLabel: string,
  points: IncomeChartPoint[],
): KeyTakeawayLine | undefined {
  if (points.length < 2) return undefined
  const cagr = netIncomeCagr3y(points)
  if (cagr !== undefined && cagr >= RAPID_GROWTH_CAGR) {
    return {
      id: 'growth_ni_cagr',
      tone: 'positive',
      text: `${companyLabel} has grown net income at a strong pace over the last three fiscal years.`,
    }
  }
  if (cagr !== undefined && cagr <= MEANINGFUL_DECLINE_CAGR) {
    return {
      id: 'decline_ni_cagr',
      tone: 'caution',
      text: `${companyLabel}'s net income has declined meaningfully over the last three fiscal years.`,
    }
  }
  const last = points[points.length - 1]?.netIncome
  const prev = points[points.length - 2]?.netIncome
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return undefined
  if (last > prev * 1.2 && last > 0) {
    return {
      id: 'growth_ni_yoy',
      tone: 'positive',
      text: `${companyLabel}'s latest fiscal year net income is sharply higher than the prior year.`,
    }
  }
  if (last < prev * 0.85 && prev > 0) {
    return {
      id: 'shrink_ni_yoy',
      tone: 'caution',
      text: `${companyLabel}'s latest fiscal year net income is down versus the prior year.`,
    }
  }
  return undefined
}

type NetIncomeBasis = 'ttm' | 'latest_fy'

function weakCashConversion(
  companyLabel: string,
  ni: number,
  fcf: number | undefined,
  niBasis: NetIncomeBasis = 'ttm',
): KeyTakeawayLine | undefined {
  if (!(ni > NEAR_ZERO_NI) || fcf === undefined || !Number.isFinite(fcf)) return undefined
  const niPhrase = niBasis === 'ttm' ? 'positive trailing-twelve-month net income' : 'positive latest full-year net income'
  if (fcf < 0) {
    return {
      id: 'fcf_negative_vs_profit',
      tone: 'caution',
      text: `${companyLabel} shows ${niPhrase}, but TTM free cash flow is negative — cash conversion deserves a closer look.`,
    }
  }
  if (fcf < ni * 0.25) {
    const compare =
      niBasis === 'ttm'
        ? 'TTM free cash flow is well below net income'
        : 'TTM free cash flow is well below that full-year net income figure'
    return {
      id: 'fcf_lags_ni',
      tone: 'caution',
      text: `${companyLabel}'s ${compare}, which can signal heavy reinvestment or weaker cash conversion.`,
    }
  }
  return undefined
}

/**
 * One headline narrative plus optional second line for moat UI.
 * Rules are ordered: data quality → balance sheet stress → cash vs earnings → profitability → growth hints.
 */
export function deriveMoatKeyTakeaway(analysis: MoatAnalysis): MoatKeyTakeawayResult {
  const { ticker, displayName, fundamentals, anyGateFail } = analysis
  const co = companyNameWithTicker(displayName, ticker)
  const yearly = fundamentals?.incomeCharts?.yearly ?? []

  if (!fundamentals) {
    return {
      primary: {
        id: 'no_fundamentals',
        tone: 'neutral',
        text: `Not enough reported fundamentals are loaded yet to summarize ${co}.`,
      },
    }
  }

  const niTtm = fundamentals.netIncomeTtmUsd
  const hasTtmNi = niTtm !== undefined && Number.isFinite(niTtm)
  const fyNi = lastFiscalNetIncomeFromYearly(yearly)
  const hasAnyNi = hasTtmNi || (fyNi !== undefined && Number.isFinite(fyNi))

  if (!hasAnyNi && yearly.length === 0) {
    return {
      primary: {
        id: 'sparse_fundamentals',
        tone: 'neutral',
        text: `Not enough reported income history is available yet to headline ${co}'s profitability.`,
      },
    }
  }

  if (latestAnnualBalanceStress(fundamentals)) {
    const primary: KeyTakeawayLine = {
      id: 'balance_sheet_stress',
      tone: 'caution',
      text: `${co}: latest reported balance sheet shows liabilities above assets, which points to severe balance sheet stress.`,
    }
    const secondary = anyGateFail
      ? ({
          id: 'gate_fail_after_stress',
          tone: 'caution',
          text: 'The moat model also flags at least one critical gate failure.',
        } satisfies KeyTakeawayLine)
      : undefined
    return { primary, secondary }
  }

  const fcfWeak = hasTtmNi && niTtm! > 0 ? weakCashConversion(co, niTtm!, fundamentals.freeCashFlowTtmUsd, 'ttm') : undefined
  if (fcfWeak) {
    const secondary = anyGateFail
      ? ({
          id: 'gate_fail_after_fcf',
          tone: 'caution',
          text: 'The moat model flags at least one critical gate failure.',
        } satisfies KeyTakeawayLine)
      : growthTakeawayFromYearly(co, yearly)
    return { primary: fcfWeak, secondary }
  }

  if (hasTtmNi) {
    const ni = niTtm!
    const absNi = Math.abs(ni)
    if (absNi < NEAR_ZERO_NI) {
      const primary: KeyTakeawayLine = {
        id: 'ni_near_zero',
        tone: 'neutral',
        text: `${co} is roughly break-even on a trailing-twelve-month net income basis.`,
      }
      const growth = growthTakeawayFromYearly(co, yearly)
      const secondary =
        (anyGateFail
          ? {
              id: 'gate_fail',
              tone: 'caution' as const,
              text: 'The moat model flags at least one critical gate failure.',
            }
          : undefined) ?? growth
      return { primary, secondary }
    }

    if (ni < 0) {
      const primary: KeyTakeawayLine = {
        id: 'ni_loss_ttm',
        tone: 'negative',
        text: `${co} lost about ${formatCompactUsd(Math.abs(ni))} per year on a trailing-twelve-month net income basis.`,
      }
      const secondary = anyGateFail
        ? ({
            id: 'gate_fail_loss',
            tone: 'caution',
            text: 'The moat model flags at least one critical gate failure.',
          } satisfies KeyTakeawayLine)
        : undefined
      return { primary, secondary }
    }

    const primary: KeyTakeawayLine = {
      id: 'ni_profit_ttm',
      tone: 'positive',
      text: `${co} earned about ${formatCompactUsd(ni)} in net profit over the trailing twelve months.`,
    }
    const cashSecond = weakCashConversion(co, ni, fundamentals.freeCashFlowTtmUsd, 'ttm')
    const growth = growthTakeawayFromYearly(co, yearly)
    const secondary =
      cashSecond ??
      (anyGateFail
        ? {
            id: 'gate_fail_profit',
            tone: 'caution' as const,
            text: 'The moat model flags at least one critical gate failure.',
          }
        : undefined) ??
      growth
    return { primary, secondary }
  }

  if (fyNi !== undefined && Number.isFinite(fyNi)) {
    const abs = Math.abs(fyNi)
    if (abs < NEAR_ZERO_NI) {
      return {
        primary: {
          id: 'fy_ni_near_zero',
          tone: 'neutral',
          text: `${co} looks roughly break-even on the latest full-year net income figure (TTM net income unavailable).`,
        },
        secondary: anyGateFail
          ? {
              id: 'gate_fail_fy',
              tone: 'caution',
              text: 'The moat model flags at least one critical gate failure.',
            }
          : growthTakeawayFromYearly(co, yearly),
      }
    }
    if (fyNi < 0) {
      return {
        primary: {
          id: 'fy_ni_loss',
          tone: 'negative',
          text: `${co} lost about ${formatCompactUsd(Math.abs(fyNi))} on the latest full-year net income figure (TTM net income unavailable).`,
        },
        secondary: anyGateFail
          ? {
              id: 'gate_fail_fy_loss',
              tone: 'caution',
              text: 'The moat model flags at least one critical gate failure.',
            }
          : undefined,
      }
    }
    return {
      primary: {
        id: 'fy_ni_profit',
        tone: 'positive',
        text: `${co} earned about ${formatCompactUsd(fyNi)} in net profit on the latest full-year report (TTM net income unavailable).`,
      },
      secondary:
        weakCashConversion(co, fyNi, fundamentals.freeCashFlowTtmUsd, 'latest_fy') ??
        (anyGateFail
          ? {
              id: 'gate_fail_fy_profit',
              tone: 'caution',
              text: 'The moat model flags at least one critical gate failure.',
            }
          : undefined) ??
        growthTakeawayFromYearly(co, yearly),
    }
  }

  const growthOnly = growthTakeawayFromYearly(co, yearly)
  if (growthOnly) {
    return {
      primary: growthOnly,
      secondary: anyGateFail
        ? {
            id: 'gate_fail_growth_only',
            tone: 'caution',
            text: 'The moat model flags at least one critical gate failure.',
          }
        : undefined,
    }
  }

  return {
    primary: {
      id: 'fallback',
      tone: 'neutral',
      text: `Fundamentals for ${co} are present, but net income could not be summarized cleanly from the latest pull.`,
    },
    secondary: anyGateFail
      ? {
          id: 'gate_fail_fallback',
          tone: 'caution',
          text: 'The moat model flags at least one critical gate failure.',
        }
      : undefined,
  }
}
