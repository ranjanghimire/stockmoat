import type { CompanyRawPack } from '../fmp/fetchCompanyRawPack'
import { num } from '../fmp/normalize'
import { industryFromFmpProfile, sectorFromFmpProfile } from '../fmp/profileClassification'
import type { EditorialProfileInput } from './generateEditorialFromProfile'

export function editorialInputFromRawPack(symbol: string, pack: CompanyRawPack): EditorialProfileInput | null {
  const sym = symbol.trim().toUpperCase()
  const profile = pack.profile
  if (!profile) return null

  const companyName =
    (typeof profile.companyName === 'string' && profile.companyName.trim()) ||
    (typeof profile.name === 'string' && profile.name.trim()) ||
    sym
  const sector = sectorFromFmpProfile(profile) ?? 'Unknown'
  const industry = industryFromFmpProfile(profile) ?? 'Unknown'
  const description = typeof profile.description === 'string' ? profile.description.trim() : ''

  if (!description) return null

  const mktCap = num(profile.marketCap, profile.mktCap)

  return {
    symbol: sym,
    companyName,
    sector,
    industry,
    description,
    mktCapUsd: mktCap,
  }
}
