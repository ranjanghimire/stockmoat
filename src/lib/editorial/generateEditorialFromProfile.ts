import { companyNameWithTicker } from '../deriveMoatKeyTakeaway'

export interface EditorialProfileInput {
  symbol: string
  companyName: string
  sector: string
  industry: string
  description: string
  mktCapUsd?: number
}

export interface GeneratedEditorial {
  moatBody: string
  howTheyMakeMoneyBody: string
  recentDealsBody: string
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function firstSentence(text: string, maxLen = 320): string {
  const t = cleanText(text)
  if (!t) return ''
  const m = t.match(/^[^.!?]+[.!?]/)
  const sent = m ? m[0] : t.slice(0, maxLen)
  return sent.length > maxLen ? `${sent.slice(0, maxLen - 1).trim()}…` : sent
}

function moatBySector(sector: string, industry: string, co: string): string {
  const s = sector.toLowerCase()
  const ind = industry.toLowerCase()
  if (s.includes('technology') || ind.includes('software') || ind.includes('semiconductor')) {
    return `${co}'s moat comes from product and platform differentiation, R&D scale, and customer switching costs in ${industry}.`
  }
  if (s.includes('financial') || ind.includes('bank') || ind.includes('insurance')) {
    return `${co}'s moat comes from scale, distribution, and underwriting or balance-sheet strength in ${industry}.`
  }
  if (s.includes('health') || ind.includes('pharma') || ind.includes('biotech')) {
    return `${co}'s moat comes from intellectual property, clinical and regulatory expertise, and commercial reach in ${industry}.`
  }
  if (s.includes('consumer') || ind.includes('retail') || ind.includes('restaurant')) {
    return `${co}'s moat comes from brand strength, customer loyalty, and efficient distribution in ${industry}.`
  }
  if (s.includes('energy') || ind.includes('oil') || ind.includes('mining')) {
    return `${co}'s moat comes from resource quality, cost position, and operational scale in ${industry}.`
  }
  if (s.includes('industrial') || ind.includes('machinery') || ind.includes('aerospace')) {
    return `${co}'s moat comes from engineering depth, installed base, and aftermarket relationships in ${industry}.`
  }
  if (s.includes('communication') || ind.includes('telecom')) {
    return `${co}'s moat comes from network assets, subscriber scale, and spectrum or infrastructure advantages in ${industry}.`
  }
  return `${co}'s moat comes from competitive positioning, scale, and execution within ${industry}.`
}

const DEAL_KEYWORDS =
  /\b(partner|partnership|collaborat|license|licensing|joint venture|strategic agreement|alliance|distribut|supply agreement|acqui|merger|investment in|cloud agreement|multi-year)\b/i

function sentences(text: string): string[] {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 40)
}

function recentDealsFromDescription(co: string, description: string, sector: string, industry: string): string {
  const hits = sentences(description).filter((s) => DEAL_KEYWORDS.test(s)).slice(0, 2)
  if (hits.length > 0) {
    const joined = hits.map((s) => (s.endsWith('.') ? s : `${s}.`)).join(' ')
    return `${co}'s recent strategic activity, as described in public company materials, includes ${joined}`
  }
  return `${co}'s recent deals and partnerships are best tracked through investor relations and SEC filings; this automated summary highlights ${industry} positioning in ${sector} while specific alliance headlines should be refreshed periodically.`
}

function howFromDescription(co: string, description: string, industry: string): string {
  const first = firstSentence(description, 280)
  if (first.length > 60) {
    const lower = first.charAt(0).toLowerCase() + first.slice(1)
    if (/^(designs|develops|provides|operates|engages|offers|manufactures|distributes|sells|owns)\b/i.test(lower)) {
      return `${co} makes money by ${lower.replace(/\.$/, '')}.`
    }
    return `${co} makes money through ${lower.replace(/\.$/, '')}.`
  }
  return `${co} makes money by delivering products and services to customers in ${industry}.`
}

export function generateEditorialFromProfile(input: EditorialProfileInput): GeneratedEditorial {
  const co = companyNameWithTicker(input.companyName, input.symbol)
  const sector = input.sector.trim() || 'its sector'
  const industry = input.industry.trim() || 'its industry'
  const description = cleanText(input.description)

  return {
    moatBody: moatBySector(sector, industry, co),
    howTheyMakeMoneyBody: howFromDescription(co, description, industry),
    recentDealsBody: recentDealsFromDescription(co, description, sector, industry),
  }
}
