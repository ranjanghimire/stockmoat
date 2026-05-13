import { ratioFromStrings } from './hash'

export interface MetricEval {
  id: string
  subscore: number
  gatePass: boolean
  displayValue: string
  peerNote?: string
  /** When mode is gate and gatePass is true, scales contribution (defaults to 1). */
  gateCredit?: number
}

function peerLine(ticker: string, id: string, peerRelative?: boolean): string | undefined {
  if (!peerRelative) return undefined
  const r = ratioFromStrings(ticker, id, 'peer')
  const n = 5 + Math.floor(ratioFromStrings(ticker, id, 'n') * 20)
  const pct = Math.min(95, Math.max(5, Math.round(r * 100)))
  return `Peer set n≈${n} (mock). Subject ≈ ${pct}th percentile vs peer median.`
}

export function evaluateMetricDemo(
  ticker: string,
  metricId: string,
  _mode: 'gate' | 'score' | 'hybrid',
  peerRelative?: boolean,
): MetricEval {
  const r = ratioFromStrings(ticker, metricId)
  const peerNote = peerLine(ticker, metricId, peerRelative)

  const base = (): MetricEval => ({
    id: metricId,
    subscore: r,
    gatePass: r > 0.18,
    displayValue: `${(r * 100).toFixed(0)}% (mock index)`,
    peerNote,
  })

  switch (metricId) {
    case 'piotroski_f_score': {
      const f = Math.min(9, Math.floor(r * 10))
      const sub = f / 9
      return {
        id: metricId,
        subscore: sub,
        gatePass: f >= 4,
        displayValue: `${f} / 9`,
        peerNote,
      }
    }
    case 'cet1_or_tier1_capital_vs_requirement': {
      const pass = r > 0.1
      return {
        id: metricId,
        subscore: pass ? 1 : 0,
        gatePass: pass,
        displayValue: pass ? 'Meets buffer vs requirement' : 'Below internal buffer (demo)',
        peerNote,
      }
    }
    case 'debt_to_capital': {
      const pass = r > 0.15
      const dc = (0.15 + r * 0.45).toFixed(2)
      return {
        id: metricId,
        subscore: pass ? 1 : 0.2,
        gatePass: pass,
        displayValue: `${dc}x (demo)`,
        peerNote,
      }
    }
    case 'net_debt_to_ebitda':
    case 'net_debt_to_ebitda_reit_definition': {
      const nd = (0.5 + r * 4.5).toFixed(2)
      const pass = Number(nd) < 3.8
      const sub = pass ? 0.55 + r * 0.45 : r * 0.35
      return {
        id: metricId,
        subscore: sub,
        gatePass: pass,
        displayValue: `${nd}x (demo)`,
        peerNote,
      }
    }
    case 'interest_coverage': {
      const ic = (1.5 + r * 12).toFixed(1)
      const pass = Number(ic) >= 2.5
      return {
        id: metricId,
        subscore: Math.min(1, (Number(ic) - 1) / 10),
        gatePass: pass,
        displayValue: `${ic}x (demo)`,
        peerNote,
      }
    }
    case 'fcf_positive_ttm': {
      const pos = r > 0.35
      return {
        id: metricId,
        subscore: pos ? 0.7 + 0.3 * r : 0.2 * r,
        gatePass: pos,
        displayValue: pos ? 'FCF > 0 (TTM, demo)' : 'FCF ≤ 0 (TTM, demo)',
        peerNote,
      }
    }
    case 'forward_pe_vs_trailing_pe': {
      const fwdLower = r > 0.45
      return {
        id: metricId,
        subscore: fwdLower ? 0.55 + 0.45 * r : 0.35 * r,
        gatePass: true,
        displayValue: fwdLower ? 'Forward < trailing (demo)' : 'Forward ≥ trailing (demo)',
        peerNote,
      }
    }
    case 'peg_ttm': {
      const peg = (0.4 + r * 2.2).toFixed(2)
      return {
        id: metricId,
        subscore: Math.max(0, 1 - Number(peg) / 2.5),
        gatePass: true,
        displayValue: peg,
        peerNote,
      }
    }
    case 'rule_of_40': {
      const rf = Math.round(25 + r * 25)
      return {
        id: metricId,
        subscore: Math.min(1, rf / 45),
        gatePass: true,
        displayValue: `${rf}% (demo, rev growth + margin)`,
        peerNote,
      }
    }
    case 'eps_yoy_growth_2_of_3': {
      const ok = r > 0.3
      return {
        id: metricId,
        subscore: ok ? 0.65 + 0.35 * r : 0.25 * r,
        gatePass: true,
        displayValue: ok ? 'Met in ≥2 of last 3 years (demo)' : 'Weak EPS growth pattern (demo)',
        peerNote,
      }
    }
    default:
      return base()
  }
}
