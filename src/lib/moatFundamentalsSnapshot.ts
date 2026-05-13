import type { CompanyFacts } from './fmp/buildCompanyFacts'

/** Dollar and ratio context attached to analysis for pillar drill-downs (esp. cash truth). */
export interface MoatFundamentalsSnapshot {
  revenueTtmUsd?: number
  netIncomeTtmUsd?: number
  operatingCashFlowTtmUsd?: number
  freeCashFlowTtmUsd?: number
  capexTtmUsd?: number
  cashAndEquivalentsUsd?: number
  totalDebtUsd?: number
  /** OCF ÷ NI when computable; same signal as `ocf_to_ni_ttm` metric. */
  ocfToNetIncome?: number
  fcfYield?: number
}

export function buildMoatFundamentalsSnapshot(f: CompanyFacts): MoatFundamentalsSnapshot {
  return {
    revenueTtmUsd: f.revenueTtmAbsolute,
    netIncomeTtmUsd: f.niTtmAbsolute,
    operatingCashFlowTtmUsd: f.ocfTtmAbsolute,
    freeCashFlowTtmUsd: f.fcfTtmAbsolute,
    capexTtmUsd: f.capexTtmAbsolute,
    cashAndEquivalentsUsd: f.cashAndEquivalents,
    totalDebtUsd: f.totalDebt,
    ocfToNetIncome: f.ocfToNetIncome,
    fcfYield: f.fcfYield,
  }
}
