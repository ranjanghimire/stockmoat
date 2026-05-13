import type { CompanyFacts } from './fmp/buildCompanyFacts'
import type { PeerMedians } from './fmp/peerMedians'
import type { ProfileMetricDef } from '../types/sectorProfiles'
import type { MetricEval } from './mockMetricDriver'
import { evaluateMetricDemo } from './mockMetricDriver'

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function fmt(x: number | undefined, digits = 2): string {
  if (x === undefined || !Number.isFinite(x)) return '—'
  return x.toFixed(digits)
}

function scoreLowerVsMedian(subject?: number, median?: number): number {
  if (!subject || !median || subject <= 0 || median <= 0) return 0.45
  const rel = subject / median
  if (rel <= 0.75) return 0.95
  if (rel <= 0.9) return 0.85
  if (rel <= 1.0) return 0.72
  if (rel <= 1.15) return 0.55
  return 0.35
}

function scoreHigherVsMedian(subject?: number, median?: number): number {
  if (subject === undefined || median === undefined || !Number.isFinite(subject) || !Number.isFinite(median)) {
    return 0.45
  }
  if (median <= 0) return clamp(subject / 0.2, 0, 1)
  const rel = subject / median
  if (rel >= 1.25) return 0.95
  if (rel >= 1.1) return 0.85
  if (rel >= 1.0) return 0.72
  if (rel >= 0.85) return 0.55
  return 0.35
}

function peerNoteFor(
  peers: PeerMedians | null,
  peerRelative: boolean | undefined,
  detail: string,
): string | undefined {
  if (!peerRelative) return undefined
  if (!peers || peers.n === 0) return 'Peer multiples unavailable (FMP peers or key metrics missing).'
  const tail = peers.n < 5 ? ' Low peer count; treat as directional only.' : ''
  return `${detail} (peer n=${peers.n}).${tail}`
}

function ruleOf40Approx(facts: CompanyFacts): number | undefined {
  const rev = facts.annualRevenue
  if (rev.length < 2) return undefined
  const r0 = rev[0]
  const r1 = rev[1]
  if (r0 === undefined || r1 === undefined || Math.abs(r1) < 1e-9) return undefined
  const growth = ((r0 - r1) / Math.abs(r1)) * 100
  const marginPct = (facts.operatingMargin ?? 0) * 100
  return growth + marginPct
}

function epsGrowthPattern(facts: CompanyFacts): { sub: number; text: string } {
  const e = facts.annualEps.filter((x) => Number.isFinite(x)).slice(0, 4)
  if (e.length < 3) return { sub: 0.45, text: 'Insufficient EPS history (FMP annual).' }
  const last3 = e.slice(0, 3)
  const positive = last3.every((x) => x > 0)
  let yoyPos = 0
  for (let i = 0; i < 2; i++) {
    if (e[i] > e[i + 1]) yoyPos++
  }
  const ok = positive && yoyPos >= 1
  const sub = ok ? clamp(0.55 + 0.2 * yoyPos, 0, 1) : 0.35
  return {
    sub,
    text: ok
      ? `EPS > 0 for last ${last3.length} yrs; YoY up in ${yoyPos} of last 2 transitions (FMP).`
      : 'EPS stability check not met vs YAML heuristic (FMP annual).',
  }
}

function grossMarginStability(facts: CompanyFacts): { sub: number; text: string } {
  const g = facts.annualGrossMargin.slice(0, 3).filter((x) => Number.isFinite(x))
  if (g.length < 2) {
    const gm = facts.grossMargin
    if (gm === undefined) return { sub: 0.45, text: 'Gross margin history unavailable.' }
    return { sub: 0.65, text: `Latest gross margin ${fmt(gm * 100, 1)}% (TTM).` }
  }
  const mean = g.reduce((a, b) => a + b, 0) / g.length
  const varr = g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length
  const vol = Math.sqrt(varr)
  const sub = clamp(1 - vol * 4, 0, 1)
  return { sub, text: `3Y gross margin vol ≈ ${fmt(vol * 100, 1)}pp (annual).` }
}

export function createLiveMetricEvaluator(
  ticker: string,
  facts: CompanyFacts,
  peers: PeerMedians | null,
): (m: ProfileMetricDef) => MetricEval {
  return (m: ProfileMetricDef): MetricEval => {
    const peerRel = m.peer_relative
    const p = peers

    const lowerVsPeers = (label: string, subject?: number, med?: number) => {
      const sub = scoreLowerVsMedian(subject, med)
      return {
        id: m.id,
        subscore: sub,
        gatePass: true,
        displayValue: `${label}: ${fmt(subject)} vs median ${fmt(med)}`,
        peerNote: peerNoteFor(p, peerRel, `${label}: subject ${fmt(subject)} vs peer median ${fmt(med)}`),
      } satisfies MetricEval
    }

    const higherVsPeers = (label: string, subject?: number, med?: number) => {
      const sub = scoreHigherVsMedian(subject, med)
      return {
        id: m.id,
        subscore: sub,
        gatePass: true,
        displayValue: `${label}: ${fmt(subject)} vs median ${fmt(med)}`,
        peerNote: peerNoteFor(p, peerRel, `${label}: subject ${fmt(subject)} vs peer median ${fmt(med)}`),
      } satisfies MetricEval
    }

    switch (m.id) {
      case 'price_to_tangible_book_vs_peer': {
        const ptb = facts.priceToTangibleBook
        if (ptb === undefined || !Number.isFinite(ptb) || ptb <= 0) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'P/Tangible BV unavailable (price or tangible BV/Share missing).',
            peerNote: peerNoteFor(p, peerRel, 'Peer P/TBV not computed in this version.'),
          }
        }
        const sub = clamp(1.15 / ptb, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(ptb, 2)}× (price / tangible BV per share)`,
          peerNote: peerNoteFor(p, peerRel, 'Peer P/TBV median not fetched; shown as absolute multiple only.'),
        }
      }
      case 'price_to_book_vs_peer':
        return lowerVsPeers('P/B', facts.priceToBook, p?.priceToBook)

      case 'forward_pe_vs_trailing_pe': {
        const tr = facts.peTrailing
        const fw = facts.forwardPe
        if (tr !== undefined && fw !== undefined && tr > 0 && fw > 0) {
          const better = fw < tr
          const sub = better ? 0.78 : 0.42
          return {
            id: m.id,
            subscore: sub,
            gatePass: true,
            displayValue: better ? `Forward P/E ${fmt(fw)} < trailing ${fmt(tr)}` : `Forward P/E ${fmt(fw)} ≥ trailing ${fmt(tr)}`,
          }
        }
        return {
          id: m.id,
          subscore: 0.48,
          gatePass: true,
          displayValue: 'Forward P/E unavailable in FMP payload for this symbol.',
        }
      }

      case 'dividend_yield_vs_5y_median': {
        const y = facts.dividendYield
        if (y === undefined) {
          return { id: m.id, subscore: 0.45, gatePass: true, displayValue: 'Dividend yield unavailable.' }
        }
        const sub = clamp(y * 40, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(y * 100, 2)}% (TTM yield; 5Y median not fetched yet)`,
        }
      }

      case 'roe_vs_peer':
        return higherVsPeers('ROE', facts.roe, p?.roe)
      case 'roa_vs_peer':
        return higherVsPeers('ROA', facts.roa, p?.roa)
      case 'roic_vs_peer':
        return higherVsPeers('ROIC', facts.roic, p?.roic)

      case 'operating_margin_vs_peer':
        return higherVsPeers('Operating margin', facts.operatingMargin, p?.operatingMargin)

      case 'ev_to_ebitda_vs_peer':
        return lowerVsPeers('EV/EBITDA', facts.evToEbitda, p?.evToEbitda)
      case 'ev_to_ebit_vs_peer':
        return lowerVsPeers('EV/EBIT', facts.evToEbit, p?.evToEbit)

      case 'fcf_yield_vs_peer':
        return higherVsPeers('FCF yield', facts.fcfYield, p?.fcfYield)

      case 'peg_ttm': {
        const peg = facts.pegRatio
        if (peg === undefined || !Number.isFinite(peg) || peg <= 0) {
          return { id: m.id, subscore: 0.45, gatePass: true, displayValue: 'PEG unavailable.' }
        }
        const sub = clamp(1 - peg / 2.5, 0, 1)
        return { id: m.id, subscore: sub, gatePass: true, displayValue: fmt(peg, 2) }
      }

      case 'ev_to_gross_profit_vs_peer':
        return lowerVsPeers('EV / gross profit', facts.enterpriseValueToGrossProfit, p?.enterpriseValueToGrossProfit)

      case 'ev_to_revenue_vs_peer':
        return lowerVsPeers('EV / revenue', facts.enterpriseValueToRevenue, p?.enterpriseValueToRevenue)

      case 'net_debt_to_ebitda':
      case 'net_debt_to_ebitda_reit_definition': {
        const nd = facts.netDebtToEbitda
        if (nd === undefined || !Number.isFinite(nd)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            gateCredit: 0.55,
            displayValue: 'Net debt / EBITDA unavailable.',
          }
        }
        const pass = nd < 3
        const sub = pass ? clamp(0.55 + (3 - nd) / 6, 0, 1) : clamp(nd / 6, 0, 0.45)
        return {
          id: m.id,
          subscore: sub,
          gatePass: pass,
          displayValue: `${fmt(nd)}× (FMP TTM)`,
        }
      }

      case 'interest_coverage': {
        const ic = facts.interestCoverage
        if (ic === undefined || !Number.isFinite(ic)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            gateCredit: 0.55,
            displayValue: 'Interest coverage unavailable.',
          }
        }
        const pass = ic >= 2.5
        const sub = clamp((ic - 1) / 10, 0, 1)
        return { id: m.id, subscore: sub, gatePass: pass, displayValue: `${fmt(ic, 1)}×` }
      }

      case 'debt_to_capital': {
        const dc = facts.debtToCapital
        if (dc === undefined || !Number.isFinite(dc)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            gateCredit: 0.6,
            displayValue: 'Debt / capital unavailable.',
          }
        }
        const pass = dc < 0.65
        return { id: m.id, subscore: pass ? 0.75 : 0.35, gatePass: pass, displayValue: `${fmt(dc * 100, 1)}%` }
      }

      case 'ocf_to_ni_ttm': {
        const v = facts.ocfToNetIncome
        if (v === undefined || !Number.isFinite(v)) {
          return { id: m.id, subscore: 0.45, gatePass: true, displayValue: 'OCF / NI proxy unavailable.' }
        }
        const sub = clamp((v - 0.8) / 0.6, 0, 1)
        return { id: m.id, subscore: sub, gatePass: true, displayValue: `${fmt(v, 2)}× (income quality / OCF proxy)` }
      }

      case 'fcf_positive_ttm': {
        const yld = facts.fcfYield
        const pos = yld !== undefined && yld > 0
        const sub = pos ? clamp(0.55 + yld * 20, 0, 1) : 0.3
        return {
          id: m.id,
          subscore: sub,
          gatePass: pos,
          displayValue: pos ? `FCF yield positive (${fmt(yld! * 100, 2)}%)` : 'FCF yield ≤ 0 (FMP TTM proxy).',
        }
      }

      case 'ocf_to_capex_coverage': {
        return {
          id: m.id,
          subscore: 0.5,
          gatePass: true,
          displayValue: 'OCF / capex not wired (needs capex line items).',
        }
      }

      case 'piotroski_f_score': {
        const f = facts.piotroski
        if (f === undefined || !Number.isFinite(f)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Piotroski score unavailable from FMP /v4/score.',
          }
        }
        const fi = clamp(Math.round(f), 0, 9)
        const sub = fi / 9
        const gatePass = fi >= 4
        return { id: m.id, subscore: sub, gatePass, displayValue: `${fi} / 9 (FMP)` }
      }

      case 'eps_yoy_growth_2_of_3': {
        const { sub, text } = epsGrowthPattern(facts)
        return { id: m.id, subscore: sub, gatePass: true, displayValue: text }
      }

      case 'gross_margin_stability_3y': {
        const { sub, text } = grossMarginStability(facts)
        return { id: m.id, subscore: sub, gatePass: true, displayValue: text }
      }

      case 'rule_of_40': {
        const rf = ruleOf40Approx(facts)
        if (rf === undefined) {
          return { id: m.id, subscore: 0.45, gatePass: true, displayValue: 'Rule of 40 unavailable (need revenue history).' }
        }
        const sub = clamp(rf / 45, 0, 1)
        return { id: m.id, subscore: sub, gatePass: true, displayValue: `${fmt(rf, 1)}% (rev growth + op margin, FMP annual)` }
      }

      case 'fcf_yield_vs_own_5y_median': {
        const y = facts.fcfYield
        if (y === undefined) return { id: m.id, subscore: 0.45, gatePass: true, displayValue: 'FCF yield unavailable.' }
        return {
          id: m.id,
          subscore: clamp(y * 25, 0, 1),
          gatePass: true,
          displayValue: `${fmt(y * 100, 2)}% (TTM; own 5Y median not fetched yet)`,
        }
      }

      case 'ebitda_margin_vs_peer':
        return higherVsPeers('EBITDA margin vs peer op. margin proxy', facts.ebitdaMargin, p?.operatingMargin)

      case 'cet1_or_tier1_capital_vs_requirement':
        return {
          id: m.id,
          subscore: 0.55,
          gatePass: true,
          gateCredit: 0.62,
          displayValue: 'CET1 / Tier 1 not available from FMP on this plan; gate skipped.',
        }

      case 'npl_or_asset_quality_trend':
      case 'efficiency_ratio_trend_3y':
      case 'tangible_common_equity_ratio':
      case 'combined_ratio_level_and_trend':
      case 'spread_or_investment_margin_proxy':
      case 'reserve_strength_proxy':
      case 'same_store_noi_growth_or_affo_growth':
      case 'secured_debt_ratio_or_maturity_wall_proxy':
      case 'roe_vs_allowed_return_proxy':
      case 'net_cash_to_revenue_or_aum_proxy':
      case 'price_to_affo_or_ffo_vs_peer':
      case 'backlog_growth_proxy':
        return {
          id: m.id,
          subscore: 0.5,
          gatePass: true,
          displayValue: 'Specialized metric not yet mapped to FMP fields.',
        }

      default:
        return evaluateMetricDemo(ticker, m.id, m.mode, m.peer_relative)
    }
  }
}
