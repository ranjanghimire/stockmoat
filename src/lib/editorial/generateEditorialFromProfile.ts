import { companyNameWithTicker } from '../deriveMoatKeyTakeaway'

export interface EditorialProfileInput {
  symbol: string
  companyName: string
  sector: string
  industry: string
  description: string
  /** From FMP profile `marketCap` when available. */
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

/** Micro / small cap threshold (USD) for “no moat yet” heuristics. */
const SMALL_CAP_USD = 2_000_000_000

const EARLY_STAGE_HINT =
  /\b(clinical[- ]stage|preclinical|pre-revenue|development[- ]stage|early[- ]stage|investigational|no commercial product|not yet generate|immaterial revenue|limited revenue|limited operating history)\b/i

const BIOTECH_INDUSTRY = /\b(biotech|biotechnology|pharma|pharmaceutical|drug discovery|therapeutic)\b/i

function descriptionHasUniversityLicense(s: string): boolean {
  return (
    /\b(university|college)\b.*\b(license|licens)/i.test(s) ||
    /\b(license agreement).*\b(university|college)\b/i.test(s)
  )
}

function looksLikeEarlyStageBiotech(industry: string, description: string, mktCap?: number): boolean {
  const ind = industry.toLowerCase()
  if (!BIOTECH_INDUSTRY.test(ind)) return false
  if (EARLY_STAGE_HINT.test(description)) return true
  if (mktCap !== undefined && Number.isFinite(mktCap) && mktCap < SMALL_CAP_USD) return true
  return false
}

function moatHonest(
  co: string,
  sector: string,
  industry: string,
  description: string,
  mktCap?: number,
): string {
  if (looksLikeEarlyStageBiotech(industry, description, mktCap)) {
    return `${co} does not currently have a clear competitive moat.`
  }

  const s = sector.toLowerCase()
  const ind = industry.toLowerCase()

  if (s.includes('technology') || ind.includes('software') || ind.includes('semiconductor')) {
    if (mktCap !== undefined && mktCap < SMALL_CAP_USD && EARLY_STAGE_HINT.test(description)) {
      return `${co} does not yet have a proven durable moat; differentiation and scale are still emerging in ${industry}.`
    }
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

const DEAL_MATERIAL =
  /\b(acqui|merger|definitive agreement|strategic partnership|collaborat(e|ion) with|joint development|co-development|52-week|supply agreement with|alliance with)\b/i

/** Narrow university / institutional IP license — not a commercial strategic deal. */
function isNarrowIpLicenseSentence(sentence: string): boolean {
  return descriptionHasUniversityLicense(sentence) && !DEAL_MATERIAL.test(sentence)
}

function recentDealsHonest(co: string, description: string): string {
  const sentences = cleanText(description)
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 30)

  const licenseOnly = sentences.filter((s) => DEAL_MATERIAL.test(s) || /\blicense\b/i.test(s))
  if (licenseOnly.length > 0 && licenseOnly.every(isNarrowIpLicenseSentence)) {
    return `${co} has not publicly announced material commercial partnerships; filings describe narrower intellectual‑property or university license arrangements that are not the same as large co‑development or revenue‑sharing deals with strategic customers.`
  }

  const material = sentences.find((s) => DEAL_MATERIAL.test(s))
  if (material) {
    const line = material.endsWith('.') ? material : `${material}.`
    return `${co}'s public disclosures mention strategic or transactional activity, including ${line.charAt(0).toLowerCase()}${line.slice(1)}`
  }

  return `${co} has not publicly announced material partnerships or commercial deals.`
}

function howHonest(co: string, description: string, industry: string, mktCap?: number): string {
  const first = firstSentence(description, 360)
  if (first.length > 60) {
    const lower = first.charAt(0).toLowerCase() + first.slice(1)
    let base: string
    if (/^(designs|develops|provides|operates|engages|offers|manufactures|distributes|sells|owns)\b/i.test(lower)) {
      base = `${co} makes money by ${lower.replace(/\.$/, '')}.`
    } else {
      base = `${co} makes money through ${lower.replace(/\.$/, '')}.`
    }

    if (looksLikeEarlyStageBiotech(industry, description, mktCap) || EARLY_STAGE_HINT.test(description)) {
      if (!/\b(limited|early|minimal|immaterial|not material)\b/i.test(base)) {
        return `${base.replace(/\.$/, '')}, though reported revenues remain limited or early‑stage.`
      }
    }
    return base
  }

  if (looksLikeEarlyStageBiotech(industry, description, mktCap)) {
    return `${co} is an early‑stage ${industry} company; product revenue is not yet meaningful relative to R&D spend.`
  }

  return `${co} makes money by serving customers in ${industry}; see financial statements for revenue mix.`
}

export function generateEditorialFromProfile(input: EditorialProfileInput): GeneratedEditorial {
  const co = companyNameWithTicker(input.companyName, input.symbol)
  const sector = input.sector.trim() || 'its sector'
  const industry = input.industry.trim() || 'its industry'
  const description = cleanText(input.description)

  return {
    moatBody: moatHonest(co, sector, industry, description, input.mktCapUsd),
    howTheyMakeMoneyBody: howHonest(co, description, industry, input.mktCapUsd),
    recentDealsBody: recentDealsHonest(co, description),
  }
}
