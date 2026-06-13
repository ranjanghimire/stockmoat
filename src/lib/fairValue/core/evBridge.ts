export function evToPricePerShare(fairEv: number, netDebt: number, shares: number): number {
  if (!Number.isFinite(shares) || shares <= 0) return NaN
  return (fairEv - netDebt) / shares
}

export function fcfYieldToPrice(fcf: number, fairYield: number, shares: number): number {
  if (!Number.isFinite(shares) || shares <= 0 || fairYield <= 0) return NaN
  return fcf / (fairYield * shares)
}

export function peToPrice(eps: number, fairPe: number): number {
  return eps * fairPe
}
