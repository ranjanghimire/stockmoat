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
  if (
    subject === undefined ||
    median === undefined ||
    !Number.isFinite(subject) ||
    !Number.isFinite(median) ||
    subject <= 0 ||
    median <= 0
  ) {
    return 0.45
  }
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
  if (!peers || peers.n === 0) return undefined
  const tail = peers.n < 5 ? ' Low peer count; treat as directional only.' : ''
  return `${detail} (peer n=${peers.n}).${tail}`
}

function peerValuationBreakdown(label: string, direction: 'lower' | 'higher'): string[] {
  const hint =
    direction === 'lower'
      ? 'Lower vs peer median is treated as more attractive on this valuation-style measure.'
      : 'Higher vs peer median is treated as stronger on this profitability / growth-style measure.'
  return [
    `${label}: ${hint}`,
    'Peer medians use FMP key-metrics TTM for matched peers when available; otherwise scoring uses a neutral mid-band for that line.',
  ]
}

import { ruleOf40Approx } from './fairValue/ruleOf40'
function epsGrowthPattern(facts: CompanyFacts): { sub: number; text: string } {
  const e = facts.annualEps.filter((x) => Number.isFinite(x)).slice(0, 4)
  if (e.length < 3) return { sub: 0.45, text: 'Insufficient EPS history (FMP annual).' }
  const last3 = e.slice(0, 3)
  const positive = last3.every((x) => x > 0)
  let yoyPos = 0
  for (let i = 0; i < 2; i++) {
    if (e[i]! > e[i + 1]!) yoyPos++
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

function normalizeCombinedRatio(x?: number): number | undefined {
  if (x === undefined || !Number.isFinite(x)) return undefined
  if (x > 0 && x <= 3) return x * 100
  return x
}

function nplAsPercentPoints(x?: number): number | undefined {
  if (x === undefined || !Number.isFinite(x)) return undefined
  if (Math.abs(x) <= 0.06) return x * 100
  return x
}

function nimAsPercentPoints(x?: number): number | undefined {
  if (x === undefined || !Number.isFinite(x)) return undefined
  if (Math.abs(x) <= 0.25) return x * 100
  return x
}

export function createLiveMetricEvaluator(
  ticker: string,
  facts: CompanyFacts,
  peers: PeerMedians | null,
): (m: ProfileMetricDef) => MetricEval {
  return (m: ProfileMetricDef): MetricEval => {
    const peerRel = m.peer_relative
    const p = peers

    const lowerVsPeers = (label: string, subject?: number, med?: number): MetricEval => {
      const sub = scoreLowerVsMedian(subject, med)
      const hasMed = med !== undefined && Number.isFinite(med) && med > 0
      return {
        id: m.id,
        subscore: sub,
        gatePass: true,
        displayValue: hasMed
          ? `${label}: ${fmt(subject)} vs peer median ${fmt(med)}`
          : `${label}: ${fmt(subject)} (peer median unavailable)`,
        peerNote: peerNoteFor(p, peerRel, `${label}: subject ${fmt(subject)} vs peer median ${fmt(med)}`),
        breakdown: peerValuationBreakdown(label, 'lower'),
        hints: { subjectValue: subject, peerMedian: med },
      }
    }

    const higherVsPeers = (label: string, subject?: number, med?: number): MetricEval => {
      const sub = scoreHigherVsMedian(subject, med)
      const hasMed = med !== undefined && Number.isFinite(med)
      return {
        id: m.id,
        subscore: sub,
        gatePass: true,
        displayValue: hasMed
          ? `${label}: ${fmt(subject)} vs peer median ${fmt(med)}`
          : `${label}: ${fmt(subject)} (peer median unavailable)`,
        peerNote: peerNoteFor(p, peerRel, `${label}: subject ${fmt(subject)} vs peer median ${fmt(med)}`),
        breakdown: peerValuationBreakdown(label, 'higher'),
        hints: { subjectValue: subject, peerMedian: med },
      }
    }

    switch (m.id) {
      case 'price_to_tangible_book_vs_peer': {
        const ptb = facts.priceToTangibleBook
        if (ptb === undefined || !Number.isFinite(ptb) || ptb <= 0) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'P/Tangible BV unavailable (price or tangible BV per share missing).',
            peerNote: peerNoteFor(p, peerRel, 'Peer P/TBV not computed in this version.'),
            breakdown: [
              'Needs last price and tangible book value per share (FMP quote + key-metrics TTM).',
              'Peer P/TBV median is not fetched yet; score uses an absolute “cheaper is better” bend on P/TBV only.',
            ],
          }
        }
        const sub = clamp(1.15 / ptb, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(ptb, 2)}× (price / tangible BV per share)`,
          peerNote: peerNoteFor(p, peerRel, 'Peer P/TBV median not fetched; shown as absolute multiple only.'),
          breakdown: [
            `P/Tangible BV = price ÷ tangibleBookValuePerShare ≈ ${fmt(ptb, 2)}×.`,
            'Lower multiple scores higher when data exists (no peer median on this field yet).',
          ],
        }
      }

      case 'price_to_book_vs_peer': {
        const ev = lowerVsPeers('P/B', facts.priceToBook, p?.priceToBook)
        return {
          ...ev,
          breakdown: [
            ...(ev.breakdown ?? []),
            'Subject P/B from FMP key-metrics / ratios TTM vs peer median from peer key-metrics TTM.',
          ],
        }
      }

      case 'forward_pe_vs_trailing_pe': {
        const tr = facts.peTrailing
        const fw = facts.forwardPe
        const src = facts.forwardPeSource
        const srcLabel =
          src === 'analyst' ? 'analyst EPS (latest calendar year in estimates)' : src === 'ratios' ? 'ratios TTM' : src === 'key_metrics' ? 'key-metrics TTM' : 'n/a'
        if (tr !== undefined && fw !== undefined && tr > 0 && fw > 0) {
          const better = fw < tr
          const sub = better ? 0.78 : 0.42
          return {
            id: m.id,
            subscore: sub,
            gatePass: true,
            displayValue: better
              ? `Forward P/E ${fmt(fw)} < trailing ${fmt(tr)}`
              : `Forward P/E ${fmt(fw)} ≥ trailing ${fmt(tr)}`,
            breakdown: [
              `Trailing P/E ≈ ${fmt(tr)} (quote / key-metrics / ratios).`,
              `Forward P/E ≈ ${fmt(fw)} (preferred source: ${srcLabel}).`,
              'Forward below trailing is scored as more attractive (growth / expectations priced in).',
            ],
          }
        }
        return {
          id: m.id,
          subscore: 0.48,
          gatePass: true,
          displayValue: 'Forward P/E unavailable or trailing P/E missing for this symbol.',
          breakdown: [
            'Forward P/E prefers analyst consensus EPS for the latest estimate year, then ratios TTM forward fields, then key-metrics.',
            'Trailing P/E is taken from quote / key-metrics / ratios TTM.',
          ],
        }
      }

      case 'dividend_yield_vs_5y_median': {
        const y = facts.dividendYield
        const med = facts.dividendYieldMedianHistorical
        if (y === undefined) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Dividend yield unavailable.',
            breakdown: ['TTM dividend yield from FMP key-metrics / ratios TTM.', 'Historical median uses FY DPS ÷ current price (up to 5 FY pairs).'],
          }
        }
        if (med !== undefined && med > 0) {
          const rel = y / med
          const sub = clamp(0.35 + 0.65 * clamp(rel / 1.25, 0, 1.25), 0, 1)
          return {
            id: m.id,
            subscore: sub,
            gatePass: true,
            displayValue: `${fmt(y * 100, 2)}% vs own implied-yield median ${fmt(med * 100, 2)}%`,
            breakdown: [
              `Current TTM dividend yield ≈ ${fmt(y * 100, 2)}%.`,
              `Own “5Y-style” median ≈ ${fmt(med * 100, 2)}% from FY DPS ÷ latest price (same price for all FY; conservative proxy).`,
              'Higher current yield vs that median scores higher (income investor lens).',
            ],
          }
        }
        const sub = clamp(y * 40, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(y * 100, 2)}% (TTM; FY DPS history insufficient for median)`,
          breakdown: [
            `TTM dividend yield ≈ ${fmt(y * 100, 2)}%.`,
            'FY DPS series from annual cash-flow + income (dividends ÷ diluted shares) was too short for a robust median.',
          ],
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
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'PEG unavailable.',
            breakdown: [
              'PEG from FMP key-metrics / ratios TTM (incl. priceEarningsToGrowthRatioTTM aliases) when present.',
              'When absent, computed as trailing P/E ÷ EPS growth % from FMP growth fields, annual EPS YoY, or analyst estimates.',
              'PEG needs positive P/E and growth; many value names omit it.',
            ],
          }
        }
        const sub = clamp(1 - peg / 2.5, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: fmt(peg, 2),
          hints: { absoluteValue: peg, valueUnit: 'multiple' },
          breakdown: [`PEG (TTM) ≈ ${fmt(peg, 2)}.`, 'Lower PEG scores higher (bounded heuristic vs 2.5×).'],
        }
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
            breakdown: ['Net debt / EBITDA from FMP key-metrics / ratios TTM when present.', 'REIT variant uses the same field as a leverage proxy on this plan.'],
          }
        }
        const pass = nd < 3
        const sub = pass ? clamp(0.55 + (3 - nd) / 6, 0, 1) : clamp(nd / 6, 0, 0.45)
        return {
          id: m.id,
          subscore: sub,
          gatePass: pass,
          displayValue: `${fmt(nd)}× (FMP TTM)`,
          breakdown: [`Net debt / EBITDA ≈ ${fmt(nd)}×.`, 'Gate-style names: failing when ≥3× (YAML hybrid/gate intent).'],
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
            breakdown: ['Interest coverage from FMP ratios TTM, then key-metrics TTM.', 'When missing, hybrid/gate metrics soften with partial credit.'],
          }
        }
        const pass = ic >= 2.5
        const sub = clamp((ic - 1) / 10, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: pass,
          displayValue: `${fmt(ic, 1)}×`,
          breakdown: [`Interest coverage ≈ ${fmt(ic, 1)}×.`, 'Pass threshold for hybrid/gate use: ≥ 2.5× in this implementation.'],
        }
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
            breakdown: ['Debt/capital derived from debt/equity when only that is published: D/(1+D).'],
          }
        }
        const pass = dc < 0.65
        return {
          id: m.id,
          subscore: pass ? 0.75 : 0.35,
          gatePass: pass,
          displayValue: `${fmt(dc * 100, 1)}%`,
          breakdown: [`Debt / capital ≈ ${fmt(dc * 100, 1)}%.`, 'Gate pass when < 65% in this implementation.'],
        }
      }

      case 'ocf_to_ni_ttm': {
        const v = facts.ocfToNetIncome
        const ocfAbs = facts.ocfTtmAbsolute
        const niAbs = facts.niTtmAbsolute
        let absLine: string | null = null
        if (
          ocfAbs !== undefined &&
          niAbs !== undefined &&
          Number.isFinite(ocfAbs) &&
          Number.isFinite(niAbs) &&
          Math.abs(niAbs) > 1e-9
        ) {
          const scale = Math.max(Math.abs(ocfAbs), Math.abs(niAbs)) >= 1e9 ? 1e9 : 1e6
          const unit = scale >= 1e9 ? 'B' : 'M'
          absLine = `TTM statements (USD): operating cash flow ≈ ${fmt(ocfAbs / scale, 2)}${unit} vs net income ≈ ${fmt(niAbs / scale, 2)}${unit} (rough scale).`
        }
        if (v === undefined || !Number.isFinite(v)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'OCF / NI proxy unavailable.',
            breakdown: [
              'OCF/NI prefers TTM cash-flow statement ÷ TTM net income when both absolute lines exist.',
              'Otherwise falls back to FMP “income quality / OCF ratio” style fields on key-metrics.',
              ...(absLine ? [absLine] : []),
            ],
          }
        }
        const sub = clamp((v - 0.8) / 0.6, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(v, 2)}× (OCF / NI)`,
          breakdown: [
            `OCF / net income ≈ ${fmt(v, 2)}×.`,
            'Higher scores better (earnings backed by cash).',
            ...(absLine ? [absLine] : []),
          ],
        }
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
          breakdown: ['Uses FMP free cash flow yield (TTM) as the FCF>0 signal.', 'When yield is positive, score scales mildly with yield level.'],
        }
      }

      case 'ocf_to_capex_coverage': {
        const v = facts.ocfToCapexTtm
        if (v === undefined || !Number.isFinite(v)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            gateCredit: 0.55,
            displayValue: 'OCF / capex unavailable (TTM statements missing lines).',
            breakdown: ['OCF / |capex| from TTM cash-flow statement when operating cash flow and capex exist.'],
          }
        }
        const pass = v >= 1
        const sub = clamp((v - 0.85) / 1.2, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: pass,
          displayValue: `${fmt(v, 2)}× OCF / capex (TTM)`,
          breakdown: [`OCF / capex ≈ ${fmt(v, 2)}×.`, 'Hybrid intent: maintenance capex should not consume all OCF; pass at ≥ 1×.'],
        }
      }

      case 'piotroski_f_score': {
        const f = facts.piotroski
        if (f === undefined || !Number.isFinite(f)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Piotroski score unavailable from FMP financial-scores.',
            breakdown: [
              'Reads FMP `/stable/financial-scores` and scans for piotroski-style numeric fields (0–9).',
              'If your plan omits scores for this ticker, this will read as missing.',
            ],
          }
        }
        const fi = clamp(Math.round(f), 0, 9)
        const sub = fi / 9
        const gatePass = fi >= 4
        return {
          id: m.id,
          subscore: sub,
          gatePass,
          displayValue: `${fi} / 9`,
          hints: { absoluteValue: fi },
          breakdown: [`Piotroski F-score = ${fi} / 9.`, 'Hybrid gate: fail when F < 4 in this implementation.'],
        }
      }

      case 'eps_yoy_growth_2_of_3': {
        const { sub, text } = epsGrowthPattern(facts)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: text,
          breakdown: ['Uses up to 4 most recent annual EPS points from FMP income statements.', 'Positive EPS with at least one YoY increase in the last two steps scores higher.'],
        }
      }

      case 'gross_margin_stability_3y': {
        const { sub, text } = grossMarginStability(facts)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: text,
          breakdown: ['Volatility of annual gross margin ratios when at least two annual points exist.', 'Otherwise falls back to latest TTM gross margin only.'],
        }
      }

      case 'rule_of_40': {
        const rf = ruleOf40Approx(facts)
        if (rf === undefined) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Rule of 40 unavailable (need revenue history).',
            breakdown: ['Rule of 40 ≈ YoY revenue growth (latest vs prior FY) + operating margin (as % points).'],
          }
        }
        const sub = clamp(rf / 45, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(rf, 1)}% (rev growth + op margin, FMP annual)`,
          breakdown: [`Computed Rule-of-40 style metric ≈ ${fmt(rf, 1)}% (not adjusted for stock comp nuances).`, 'Normalized vs a 45% “great” anchor for scoring.'],
        }
      }

      case 'fcf_yield_vs_own_5y_median': {
        const cur = facts.fcfToRevenueTtm
        const med = facts.fcfToRevenueMedian5y
        if (cur !== undefined && med !== undefined && Math.abs(med) > 1e-9) {
          const rel = cur / med
          const sub = clamp(0.35 + 0.65 * clamp(rel, 0, 1.6) / 1.6, 0, 1)
          return {
            id: m.id,
            subscore: sub,
            gatePass: true,
            displayValue: `FCF/revenue ${fmt(cur * 100, 2)}% vs own median ${fmt(med * 100, 2)}%`,
            breakdown: [
              'Proxy: TTM free cash flow ÷ TTM revenue vs median of annual FCF/revenue for up to 5 FY pairs.',
              'This substitutes for a true multi-year FCF yield median when historical market caps are not fetched.',
            ],
          }
        }
        const y = facts.fcfYield
        if (y === undefined) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'FCF yield and FCF margin history unavailable.',
            breakdown: ['Needs FCF yield on key-metrics or TTM cash-flow + income for the FCF/revenue proxy.'],
          }
        }
        return {
          id: m.id,
          subscore: clamp(y * 25, 0, 1),
          gatePass: true,
          displayValue: `${fmt(y * 100, 2)}% FCF yield (TTM only; margin history missing)`,
          breakdown: ['Fallback uses FCF yield (TTM) only when the FCF/revenue own-median proxy cannot be built.'],
        }
      }

      case 'ebitda_margin_vs_peer':
        return higherVsPeers('EBITDA margin', facts.ebitdaMargin, p?.ebitdaMargin)

      case 'efficiency_ratio_trend_3y': {
        const series = facts.annualEfficiencyRatio
        if (series.length >= 2) {
          const latest = series[0]!
          const older = series[Math.min(2, series.length - 1)]!
          const improving = latest < older * 0.985
          const deltaPp = (older - latest) * 100
          const sub = improving
            ? clamp(0.55 + clamp(deltaPp / 8, 0, 1) * 0.4, 0, 1)
            : clamp(0.45 - clamp((latest - older) * 100, 0, 5) * 0.04, 0, 1)
          return {
            id: m.id,
            subscore: sub,
            gatePass: true,
            displayValue: improving
              ? `Efficiency improved: ${fmt(older * 100, 1)}% → ${fmt(latest * 100, 1)}% of revenue (annual opex)`
              : `Efficiency flat/up: ${fmt(older * 100, 1)}% → ${fmt(latest * 100, 1)}% of revenue`,
            breakdown: [
              'Efficiency ratio proxy = operating expenses ÷ revenue on annual income statements (up to 5 FY).',
              'Lower is better; compares newest FY vs FY about 2 years back when available.',
            ],
          }
        }
        const ttm = facts.bankEfficiencyRatio
        if (ttm !== undefined) {
          return {
            id: m.id,
            subscore: clamp(1 - ttm, 0, 1),
            gatePass: true,
            displayValue: `${fmt(ttm * 100, 1)}% (TTM efficiency proxy; need ≥2 FY for trend)`,
            breakdown: ['Annual history was insufficient; falls back to TTM operating expenses ÷ revenue or FMP bank efficiency ratio when present.'],
          }
        }
        return {
          id: m.id,
          subscore: 0.45,
          gatePass: true,
          displayValue: 'Efficiency trend unavailable (annual income opex/revenue missing).',
          breakdown: ['Needs annual operating expenses and revenue, or bank efficiency fields on ratios/key-metrics.'],
        }
      }

      case 'cet1_or_tier1_capital_vs_requirement': {
        return {
          id: m.id,
          subscore: 0.55,
          gatePass: true,
          gateCredit: 0.62,
          displayValue: 'CET1 / Tier 1 not exposed on this FMP surface; gate treated as pass-with-credit.',
          breakdown: [
            'Regulatory capital ratios are not available on the StockMoat FMP bundle used here.',
            'Gate is intentionally softened: pass with reduced credit so the rest of the profile still runs.',
          ],
        }
      }

      case 'npl_or_asset_quality_trend': {
        const npl = nplAsPercentPoints(facts.nonPerformingLoansRatio)
        const peerN = nplAsPercentPoints(p?.nonPerformingLoansRatio)
        if (npl !== undefined) {
          const relOk = peerN === undefined || peerN <= 0 ? true : npl <= peerN * 1.2
          const absOk = npl <= 2.5
          const gatePass = relOk && absOk
          const subPeer = scoreLowerVsMedian(npl, peerN)
          const subAbs = clamp(1 - npl / 4, 0, 1)
          const sub = clamp(0.5 * subPeer + 0.5 * subAbs, 0, 1)
          return {
            id: m.id,
            subscore: sub,
            gatePass,
            displayValue: `NPL / loans proxy ≈ ${fmt(npl, 2)}%${peerN !== undefined ? ` vs peers ≈ ${fmt(peerN, 2)}%` : ''}`,
            peerNote: peerNoteFor(p, peerRel, `NPL proxy ${fmt(npl, 2)}% vs peer ${fmt(peerN)}%`),
            breakdown: [
              'Uses NPL-to-loans style fields from FMP key-metrics / ratios when present (scaled to %-points if needed).',
              'Hybrid: fail if above ~2.5% or >1.2× peer median when peer median exists.',
            ],
          }
        }
        return {
          id: m.id,
          subscore: 0.48,
          gatePass: true,
          displayValue: 'NPL / asset quality fields not published for this ticker on FMP.',
          peerNote: peerNoteFor(p, peerRel, 'Peer NPL medians only apply when key-metrics expose NPL ratios.'),
          breakdown: ['Many non-banks do not publish NPL ratios on the TTM key-metrics feed used for peers.'],
        }
      }

      case 'tangible_common_equity_ratio': {
        const t = facts.tangibleCommonEquityRatio
        if (t === undefined || !Number.isFinite(t)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Tangible common equity / assets unavailable.',
            breakdown: ['Computed as (total equity − goodwill − intangibles) ÷ total assets from latest annual balance sheet.'],
          }
        }
        const sub = clamp((t - 0.05) / 0.12, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(t * 100, 1)}% tangible equity / assets`,
          breakdown: [
            `Tangible common equity / assets ≈ ${fmt(t * 100, 1)}%.`,
            'Higher tangible capital density scores higher (capital cushion vs intangibles).',
          ],
        }
      }

      case 'combined_ratio_level_and_trend': {
        const cr = normalizeCombinedRatio(facts.combinedRatio)
        if (cr === undefined || !Number.isFinite(cr)) {
          return {
            id: m.id,
            subscore: 0.48,
            gatePass: true,
            displayValue: 'Combined ratio not on FMP ratios TTM for this name.',
            breakdown: ['Looks for combinedRatio-style fields on ratios TTM (P&C insurers).', 'When absent, score is neutral-biased.'],
          }
        }
        const gatePass = cr < 102
        const sub = cr < 95 ? 0.92 : cr < 100 ? 0.78 : cr < 102 ? 0.62 : 0.35
        return {
          id: m.id,
          subscore: sub,
          gatePass,
          displayValue: `${fmt(cr, 1)}% combined ratio (TTM proxy)`,
          breakdown: [
            `Combined ratio ≈ ${fmt(cr, 1)}% after normalizing fractional vs percent-point FMP formats.`,
            'Hybrid: fail when combined ratio ≥ ~102% (underwriting loss / weak pricing proxy).',
          ],
        }
      }

      case 'spread_or_investment_margin_proxy': {
        const nim = nimAsPercentPoints(facts.netInterestMargin)
        if (nim === undefined) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Net interest margin not available.',
            breakdown: ['Spread proxy = net interest margin from ratios / key-metrics TTM when present.'],
          }
        }
        const sub = clamp(nim / 4.5, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(nim, 2)}% NIM (proxy)`,
          breakdown: [`Net interest margin ≈ ${fmt(nim, 2)}%.`, 'Higher NIM scores higher (simple linear cap vs ~4.5%).'],
        }
      }

      case 'reserve_strength_proxy': {
        const ic = facts.interestCoverage
        if (ic === undefined) {
          return {
            id: m.id,
            subscore: 0.46,
            gatePass: true,
            displayValue: 'Reserve proxy: interest coverage missing.',
            breakdown: [
              'True loss-reserve adequacy is not available on this FMP slice.',
              'Fallback uses interest coverage as a broad balance-sheet stress proxy.',
            ],
          }
        }
        const sub = clamp((ic - 2) / 10, 0, 1)
        const gatePass = ic >= 2.5
        return {
          id: m.id,
          subscore: sub,
          gatePass,
          displayValue: `Reserve proxy: interest coverage ${fmt(ic, 1)}×`,
          breakdown: [
            'Reserve strength is proxied by interest coverage (earnings / interest) when reserve detail is missing.',
            `Coverage ≈ ${fmt(ic, 1)}×; hybrid gate uses the same ≥2.5× pass line as the interest-coverage metric family.`,
          ],
        }
      }

      case 'net_cash_to_revenue_or_aum_proxy': {
        const v = facts.netCashToRevenueTtm
        if (v === undefined || !Number.isFinite(v)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Net cash / revenue unavailable.',
            breakdown: ['(Cash − total debt) ÷ TTM revenue using latest annual balance sheet + TTM income.'],
          }
        }
        const sub = clamp(0.5 + v * 1.2, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `${fmt(v * 100, 1)}% of revenue (net cash proxy)`,
          breakdown: [
            `Net cash / revenue ≈ ${fmt(v * 100, 1)}%.`,
            'Higher net cash relative to revenue scores higher (capital-markets “dry powder” lens).',
          ],
        }
      }

      case 'price_to_affo_or_ffo_vs_peer': {
        const pffo = facts.priceToFfo
        if (pffo !== undefined && pffo > 0 && p?.priceToFfo !== undefined && p.priceToFfo > 0) {
          const ev = lowerVsPeers('P/FFO (AFFO proxy)', pffo, p.priceToFfo)
          return {
            ...ev,
            breakdown: [
              'Subject P/FFO = price ÷ FFO per share (FFO per share falls back to OCF/share when AFFO/FFO missing).',
              'Peer median uses implied market cap ÷ shares ÷ FFO per share from peer key-metrics TTM.',
              ...(ev.breakdown ?? []),
            ],
          }
        }
        if (pffo !== undefined && pffo > 0) {
          const sub = clamp(1.25 / pffo, 0, 1)
          return {
            id: m.id,
            subscore: sub,
            gatePass: true,
            displayValue: `${fmt(pffo, 2)}× P/FFO (AFFO proxy; peer P/FFO median unavailable)`,
            peerNote: peerNoteFor(p, peerRel, 'Peer P/FFO median needs FFO fields on peer key-metrics.'),
            breakdown: [
              `P/FFO ≈ ${fmt(pffo, 2)}× on the subject.`,
              'Peer P/FFO requires FFO (or OCF) per share on peer key-metrics; when missing, an absolute bend is used.',
            ],
          }
        }
        return {
          id: m.id,
          subscore: 0.45,
          gatePass: true,
          displayValue: 'P/FFO unavailable (price or FFO/OCF per share missing).',
          breakdown: ['Needs last price and FFO per share (or operating cash flow per share as a fallback).'],
        }
      }

      case 'same_store_noi_growth_or_affo_growth': {
        const g = facts.revenueCagr3y
        const peerG = p?.revenueGrowth3Y
        if (g !== undefined && peerG !== undefined) {
          const ev = higherVsPeers('3Y revenue CAGR (NOI/AFFO proxy)', g, peerG)
          return {
            ...ev,
            breakdown: [
              'Subject growth = 3-year CAGR on annual revenue (newest vs three years back).',
              'Peer line uses FMP multi-year revenue growth fields on peer key-metrics TTM when present.',
              ...(ev.breakdown ?? []),
            ],
          }
        }
        if (g !== undefined) {
          const sub = clamp(0.45 + g / 25, 0, 1)
          return {
            id: m.id,
            subscore: sub,
            gatePass: true,
            displayValue: `3Y revenue CAGR ${fmt(g, 1)}% (peer growth unavailable)`,
            breakdown: ['Same-store NOI / AFFO is proxied by revenue CAGR when sector-specific operating metrics are absent.'],
          }
        }
        return {
          id: m.id,
          subscore: 0.45,
          gatePass: true,
          displayValue: 'Growth proxy unavailable (need ≥3 FY revenue).',
          breakdown: ['Requires at least three annual revenue points from FMP income statements.'],
        }
      }

      case 'secured_debt_ratio_or_maturity_wall_proxy': {
        const s = facts.securedDebtRatio
        if (s === undefined || !Number.isFinite(s)) {
          return {
            id: m.id,
            subscore: 0.46,
            gatePass: true,
            gateCredit: 0.55,
            displayValue: 'Secured debt / total debt proxy unavailable.',
            breakdown: ['Proxy = long-term debt ÷ total debt from latest annual balance sheet (maturity-wall / structure hint only).'],
          }
        }
        const gatePass = s < 0.82
        const sub = clamp(1 - s, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass,
          displayValue: `${fmt(s * 100, 1)}% LT debt / total debt`,
          breakdown: [
            `Long-term debt share of total debt ≈ ${fmt(s * 100, 1)}%.`,
            'Hybrid: fail when LT debt is ≥ ~82% of total debt (concentrated long-dated funding proxy).',
          ],
        }
      }

      case 'roe_vs_allowed_return_proxy': {
        const roe = facts.roe
        if (roe === undefined || !Number.isFinite(roe)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'ROE unavailable.',
            breakdown: ['Compares ROE to a stylized ~9% “allowed return” anchor for regulated utilities.'],
          }
        }
        const spread = roe * 100 - 9
        const sub = clamp(0.45 + spread / 12, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `ROE ${fmt(roe * 100, 1)}% vs ~9% anchor`,
          breakdown: [
            `ROE (TTM) ≈ ${fmt(roe * 100, 1)}%.`,
            'Scores higher when ROE exceeds a fixed 9% regulatory-return proxy (illustrative, not jurisdiction-specific).',
          ],
        }
      }

      case 'backlog_growth_proxy': {
        const d = facts.deferredRevenueYoY
        if (d === undefined || !Number.isFinite(d)) {
          return {
            id: m.id,
            subscore: 0.45,
            gatePass: true,
            displayValue: 'Backlog proxy unavailable (deferred revenue YoY).',
            breakdown: ['Uses YoY change in deferred revenue on consecutive annual balance sheets when the line exists.'],
          }
        }
        const sub = clamp(0.45 + d / 80, 0, 1)
        return {
          id: m.id,
          subscore: sub,
          gatePass: true,
          displayValue: `Deferred revenue YoY ${fmt(d, 1)}%`,
          breakdown: [
            `Deferred revenue YoY ≈ ${fmt(d, 1)}%.`,
            'Used as an order-book / backlog proxy for industrials when contract liabilities are reported.',
          ],
        }
      }

      default:
        return evaluateMetricDemo(ticker, m.id, m.mode, m.peer_relative)
    }
  }
}
