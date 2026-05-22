const PRICE_ACTION_RE =
  /\b(shares? (rise|fall|jump|drop|sink|soar|tumble|slip|gain|lose)|stock (rises|falls|jumps|drops)|trading (higher|lower)|in the (red|green)|price target|pt raised|pt cut|analyst (upgrades?|downgrades?|raises?|cuts?))\b/i

const ROUTINE_EARNINGS_RE =
  /\b(q[1-4] (earnings|results)|earnings (beat|miss|report|preview|recap)|eps (beat|miss)|reports (quarterly|q[1-4])|to report earnings|earnings call transcript)\b/i

const FLUFF_RE =
  /\b(technical analysis|chart shows|wall street (expects|analyst)|should you buy|top (stock )?picks?|penny stock)\b/i

export type PrefilterRejectReason = 'price_action' | 'routine_earnings' | 'fluff' | 'too_short' | 'too_old'

export function shouldRejectCandidate(
  headline: string,
  excerpt: string,
  publishedAt: Date,
  maxAgeHours = 96,
): PrefilterRejectReason | null {
  const h = headline.trim()
  const body = `${h} ${excerpt}`.trim()
  if (h.length < 12) return 'too_short'
  const ageMs = Date.now() - publishedAt.getTime()
  if (ageMs > maxAgeHours * 3600 * 1000) return 'too_old'
  if (PRICE_ACTION_RE.test(body) && !/\b(billion|million|\$[\d,.]+[bm]?|acquisition|merger|fda|tariff|ban|subsidy|contract|partnership)\b/i.test(body)) {
    return 'price_action'
  }
  if (ROUTINE_EARNINGS_RE.test(body)) return 'routine_earnings'
  if (FLUFF_RE.test(body)) return 'fluff'
  return null
}
