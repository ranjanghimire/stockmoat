import type { JsonRecord } from './normalize'

/** FMP stable + legacy profile payloads use inconsistent keys; try all known variants. */
const SECTOR_FIELD_KEYS = [
  'sector',
  'Sector',
  'gicsSector',
  'gics_sector',
  'generalSector',
  'companySector',
  'industrySector',
  'primarySector',
  'reportedSector',
] as const

const INDUSTRY_FIELD_KEYS = [
  'industry',
  'Industry',
  'gicsIndustry',
  'gics_industry',
  'gicsSubIndustry',
  'gics_sub_industry',
  'industryTitle',
  'sicIndustry',
  'sicDescription',
  'primaryIndustry',
  'secondaryIndustry',
  'reportedIndustry',
] as const

export function fmpPayloadHasErrorMessage(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return false
  if (Array.isArray(data)) {
    return data.length === 1 && fmpPayloadHasErrorMessage(data[0])
  }
  return typeof (data as JsonRecord)['Error Message'] === 'string'
}

export function firstNonEmptyStringField(o: JsonRecord | undefined, keys: readonly string[]): string | undefined {
  if (!o) return undefined
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string') {
      const t = v.trim()
      if (t !== '') return t
    }
  }
  return undefined
}

export function sectorFromFmpProfile(p: JsonRecord | undefined): string | undefined {
  return firstNonEmptyStringField(p, SECTOR_FIELD_KEYS)
}

export function industryFromFmpProfile(p: JsonRecord | undefined): string | undefined {
  return firstNonEmptyStringField(p, INDUSTRY_FIELD_KEYS)
}

const HQ_CITY_KEYS = ['city', 'City'] as const
const HQ_STATE_KEYS = ['state', 'State', 'stateCode', 'state_code'] as const
const HQ_COUNTRY_KEYS = ['country', 'Country'] as const

/** Human-readable HQ line from FMP stable/v3 or Yahoo-shaped profile rows (e.g. "Redmond, WA, US"). */
export function headquartersFromFmpProfile(p: JsonRecord | undefined): string | undefined {
  if (!p) return undefined
  const city = firstNonEmptyStringField(p, HQ_CITY_KEYS)
  const state = firstNonEmptyStringField(p, HQ_STATE_KEYS)
  const country = firstNonEmptyStringField(p, HQ_COUNTRY_KEYS)

  const parts: string[] = []
  if (city) parts.push(city)
  if (state && state.toLowerCase() !== city?.toLowerCase()) parts.push(state)
  if (country) {
    const countryLower = country.toLowerCase()
    if (!parts.some((part) => part.toLowerCase() === countryLower)) parts.push(country)
  }

  return parts.length > 0 ? parts.join(', ') : undefined
}

/** Fetch legacy v3 profile when stable row is missing sector or industry (routing + UI need both). */
export function fmpProfileNeedsLegacyEnrichment(p: JsonRecord | undefined): boolean {
  return sectorFromFmpProfile(p) === undefined || industryFromFmpProfile(p) === undefined
}

/**
 * Prefer stable for overlapping keys, then fill sector/industry from whichever source
 * has the first non-empty classification field.
 */
export function mergeFmpProfileRows(
  stable: JsonRecord | undefined,
  legacy: JsonRecord | undefined,
): JsonRecord | undefined {
  if (!stable && !legacy) return undefined
  const out: JsonRecord = { ...(legacy ?? {}), ...(stable ?? {}) }
  const sector = sectorFromFmpProfile(stable) ?? sectorFromFmpProfile(legacy)
  const industry = industryFromFmpProfile(stable) ?? industryFromFmpProfile(legacy)
  if (sector !== undefined) out.sector = sector
  if (industry !== undefined) out.industry = industry
  return out
}
