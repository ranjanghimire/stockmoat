export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function peerBlendWeight(peerN: number): { wp: number; ws: number } {
  const wp = peerN >= 8 ? 0.8 : peerN >= 5 ? 0.65 : 0.4
  return { wp, ws: 1 - wp }
}

export function fairMultiple(
  peerValue: number | undefined,
  sectorAnchor: number,
  peerN: number,
): number {
  const { wp, ws } = peerBlendWeight(peerN)
  const peer = peerValue !== undefined && peerValue > 0 ? peerValue : sectorAnchor
  return wp * peer + ws * sectorAnchor
}

export function fairYield(peerValue: number | undefined, sectorAnchor: number, peerN: number): number {
  return fairMultiple(peerValue, sectorAnchor, peerN)
}
