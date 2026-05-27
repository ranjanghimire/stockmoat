import type { MetricMeterKind, MetricValueUnit } from './types'

export interface MetricUiSpec {
  tooltip: string
  meterKind: MetricMeterKind
  valueUnit: MetricValueUnit
  peerDirection?: 'lower' | 'higher'
  /** For absolute_band meters (value on axis). */
  absoluteBand?: { min: number; max: number; invert?: boolean }
  /** Piotroski, rule of 40, etc. */
  absoluteScoreMax?: number
}

export interface PeSectorBand {
  cheap: number
  fairLow: number
  fairHigh: number
  expensive: number
}

const DEFAULT_PE_BAND: PeSectorBand = { cheap: 10, fairLow: 15, fairHigh: 25, expensive: 40 }

const PE_BANDS_BY_SECTOR_KEY: Record<string, PeSectorBand> = {
  technology: { cheap: 14, fairLow: 20, fairHigh: 38, expensive: 55 },
  healthcare: { cheap: 12, fairLow: 18, fairHigh: 32, expensive: 48 },
  'financial services': { cheap: 8, fairLow: 10, fairHigh: 16, expensive: 22 },
  financials: { cheap: 8, fairLow: 10, fairHigh: 16, expensive: 22 },
  utilities: { cheap: 12, fairLow: 14, fairHigh: 20, expensive: 26 },
  'real estate': { cheap: 14, fairLow: 16, fairHigh: 28, expensive: 40 },
  energy: { cheap: 6, fairLow: 8, fairHigh: 14, expensive: 22 },
  'consumer defensive': { cheap: 14, fairLow: 18, fairHigh: 28, expensive: 38 },
  'consumer cyclical': { cheap: 10, fairLow: 14, fairHigh: 24, expensive: 35 },
  industrials: { cheap: 10, fairLow: 14, fairHigh: 22, expensive: 32 },
  'basic materials': { cheap: 8, fairLow: 12, fairHigh: 20, expensive: 30 },
  communication: { cheap: 12, fairLow: 16, fairHigh: 28, expensive: 40 },
}

export function peBandForSector(sector?: string): PeSectorBand {
  if (!sector?.trim()) return DEFAULT_PE_BAND
  const key = sector.trim().toLowerCase()
  for (const [k, band] of Object.entries(PE_BANDS_BY_SECTOR_KEY)) {
    if (key.includes(k) || k.includes(key)) return band
  }
  return DEFAULT_PE_BAND
}

const REGISTRY: Record<string, MetricUiSpec> = {
  price_to_tangible_book_vs_peer: {
    tooltip: 'Price divided by tangible book value per share. Lower usually means a cheaper asset backing per share.',
    meterKind: 'absolute_band',
    valueUnit: 'multiple',
    absoluteBand: { min: 0.5, max: 4, invert: true },
  },
  price_to_book_vs_peer: {
    tooltip: 'Price-to-book compares market value to accounting book equity. Lower vs peers often means relatively cheaper.',
    meterKind: 'peer_lower_better',
    valueUnit: 'multiple',
    peerDirection: 'lower',
  },
  forward_pe_vs_trailing_pe: {
    tooltip:
      'Forward P/E uses expected next-year earnings; trailing P/E uses past earnings. Forward below trailing can mean the market expects growth.',
    meterKind: 'favorability',
    valueUnit: 'multiple',
  },
  dividend_yield_vs_5y_median: {
    tooltip: 'Current dividend yield compared with this company’s own recent history (implied from past dividends and today’s price).',
    meterKind: 'favorability',
    valueUnit: 'percent_decimal',
  },
  roe_vs_peer: {
    tooltip: 'Return on equity: profit generated per dollar of shareholder equity. Higher vs peers is usually stronger.',
    meterKind: 'peer_higher_better',
    valueUnit: 'percent_decimal',
    peerDirection: 'higher',
  },
  roa_vs_peer: {
    tooltip: 'Return on assets: how efficiently the company uses its asset base. Higher vs peers is usually stronger.',
    meterKind: 'peer_higher_better',
    valueUnit: 'percent_decimal',
    peerDirection: 'higher',
  },
  roic_vs_peer: {
    tooltip:
      'Return on invested capital: profit vs debt plus equity invested in the business. Higher vs peers suggests better capital efficiency.',
    meterKind: 'peer_higher_better',
    valueUnit: 'percent_decimal',
    peerDirection: 'higher',
  },
  operating_margin_vs_peer: {
    tooltip: 'Operating margin is operating profit as a share of revenue. Higher vs peers means more profit per sales dollar.',
    meterKind: 'peer_higher_better',
    valueUnit: 'percent_decimal',
    peerDirection: 'higher',
  },
  ebitda_margin_vs_peer: {
    tooltip: 'EBITDA margin is earnings before interest, taxes, depreciation, and amortization, as a % of revenue.',
    meterKind: 'peer_higher_better',
    valueUnit: 'percent_decimal',
    peerDirection: 'higher',
  },
  ev_to_ebitda_vs_peer: {
    tooltip:
      'Enterprise value divided by EBITDA. A valuation multiple: how much the market pays per dollar of operating cash-style earnings. Lower vs peers is usually cheaper.',
    meterKind: 'peer_lower_better',
    valueUnit: 'multiple',
    peerDirection: 'lower',
  },
  ev_to_ebit_vs_peer: {
    tooltip:
      'Enterprise value divided by EBIT (operating earnings). Shows how expensive the business is relative to operating profit. Lower vs peers is usually cheaper.',
    meterKind: 'peer_lower_better',
    valueUnit: 'multiple',
    peerDirection: 'lower',
  },
  ev_to_gross_profit_vs_peer: {
    tooltip: 'Enterprise value divided by gross profit. Used for companies where gross profit is the main economic engine.',
    meterKind: 'peer_lower_better',
    valueUnit: 'multiple',
    peerDirection: 'lower',
  },
  ev_to_revenue_vs_peer: {
    tooltip: 'Enterprise value divided by revenue (sales). A common multiple for growth or low-margin businesses.',
    meterKind: 'peer_lower_better',
    valueUnit: 'multiple',
    peerDirection: 'lower',
  },
  fcf_yield_vs_peer: {
    tooltip: 'Free cash flow yield: free cash flow divided by market value. Higher vs peers means more cash return per dollar of market cap.',
    meterKind: 'peer_higher_better',
    valueUnit: 'percent_decimal',
    peerDirection: 'higher',
  },
  peg_ttm: {
    tooltip:
      'PEG ratio divides P/E by expected earnings growth. Near 1.0 is often considered “fair”; well below 1 can look cheap vs growth, well above 1 expensive.',
    meterKind: 'absolute_band',
    valueUnit: 'multiple',
    absoluteBand: { min: 0, max: 2.5, invert: true },
  },
  gross_margin_stability_3y: {
    tooltip:
      'How much annual gross margin bounced around over about three years. Lower volatility (fewer percentage-point swings) is steadier.',
    meterKind: 'absolute_band',
    valueUnit: 'percent_points',
    absoluteBand: { min: 0, max: 12, invert: true },
  },
  eps_yoy_growth_2_of_3: {
    tooltip: 'Whether EPS grew year-over-year in at least two of the last three annual periods, with positive EPS levels.',
    meterKind: 'favorability',
    valueUnit: 'plain',
  },
  rule_of_40: {
    tooltip: 'Rule of 40 adds revenue growth % and operating margin % (common SaaS heuristic). 40%+ is often considered strong.',
    meterKind: 'absolute_band',
    valueUnit: 'percent_points',
    absoluteBand: { min: 0, max: 50, invert: false },
  },
  piotroski_f_score: {
    tooltip: 'Piotroski F-Score (0–9) combines profitability, leverage, and efficiency signals. Higher is generally healthier.',
    meterKind: 'absolute_band',
    valueUnit: 'plain',
    absoluteScoreMax: 9,
  },
  net_debt_to_ebitda: {
    tooltip: 'Net debt divided by EBITDA. Measures leverage vs cash earnings; lower usually means less debt stress.',
    meterKind: 'absolute_band',
    valueUnit: 'multiple',
    absoluteBand: { min: 0, max: 6, invert: true },
  },
  net_debt_to_ebitda_reit_definition: {
    tooltip: 'Leverage proxy for REITs: net debt relative to EBITDA. Lower is generally less leveraged.',
    meterKind: 'absolute_band',
    valueUnit: 'multiple',
    absoluteBand: { min: 0, max: 6, invert: true },
  },
  interest_coverage: {
    tooltip: 'How many times operating earnings cover interest expense. Higher means easier debt service.',
    meterKind: 'absolute_band',
    valueUnit: 'multiple',
    absoluteBand: { min: 0, max: 12, invert: false },
  },
  debt_to_capital: {
    tooltip: 'Debt as a share of total capital (debt + equity). Lower means less reliance on borrowing.',
    meterKind: 'absolute_band',
    valueUnit: 'percent_decimal',
    absoluteBand: { min: 0, max: 0.9, invert: true },
  },
  ocf_to_ni_ttm: {
    tooltip: 'Operating cash flow divided by net income. Above 1× suggests earnings are backed by real cash.',
    meterKind: 'absolute_band',
    valueUnit: 'multiple',
    absoluteBand: { min: 0.5, max: 2, invert: false },
  },
  fcf_positive_ttm: {
    tooltip: 'Whether the company generated positive free cash flow recently (yield > 0).',
    meterKind: 'gate',
    valueUnit: 'percent_decimal',
  },
  ocf_to_capex_coverage: {
    tooltip: 'Operating cash flow divided by capital spending. Above 1× means OCF covers capex.',
    meterKind: 'absolute_band',
    valueUnit: 'multiple',
    absoluteBand: { min: 0, max: 3, invert: false },
  },
  fcf_yield_vs_own_5y_median: {
    tooltip: 'Today’s free-cash-flow yield vs this company’s own median over recent years.',
    meterKind: 'favorability',
    valueUnit: 'percent_decimal',
  },
}

const DEFAULT_SPEC: MetricUiSpec = {
  tooltip: 'This line is part of the sector scorecard. The meter reflects how favorable the reading is under our rubric.',
  meterKind: 'favorability',
  valueUnit: 'plain',
}

export function metricUiSpec(metricId: string): MetricUiSpec {
  return REGISTRY[metricId] ?? DEFAULT_SPEC
}

/** Valuation snapshot row specs (not always scorecard lines). */
export const VALUATION_ROW_SPECS = {
  pe_trailing: {
    id: 'pe_trailing',
    label: 'P/E (trailing)',
    tooltip:
      'Trailing price-to-earnings: share price divided by earnings per share over the last twelve months. Compare to sector norms — very high can mean expensive or low earnings.',
    valueUnit: 'multiple' as MetricValueUnit,
  },
  pe_forward: {
    id: 'pe_forward',
    label: 'Forward P/E',
    tooltip: 'Forward P/E uses expected next-year earnings (often from analyst estimates). Lower than trailing can imply expected growth.',
    valueUnit: 'multiple' as MetricValueUnit,
  },
  peg: {
    id: 'peg',
    label: 'PEG (TTM)',
    tooltip: 'Price/earnings divided by growth. Near 1 is a common “fair” reference; lower can look cheaper relative to growth.',
    valueUnit: 'multiple' as MetricValueUnit,
  },
  ev_ebitda: {
    id: 'ev_ebitda',
    label: 'EV / EBITDA',
    tooltip: 'Enterprise value per dollar of EBITDA — a common valuation multiple for operating earnings power.',
    valueUnit: 'multiple' as MetricValueUnit,
  },
  ev_ebit: {
    id: 'ev_ebit',
    label: 'EV / EBIT',
    tooltip: 'Enterprise value per dollar of operating profit (EBIT). Lower multiples often mean cheaper vs earnings.',
    valueUnit: 'multiple' as MetricValueUnit,
  },
}
