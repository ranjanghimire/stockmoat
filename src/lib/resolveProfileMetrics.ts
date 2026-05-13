import type { ItVariant, ProfileMetricDef, ProfileDef } from '../types/sectorProfiles'

export interface ResolvedProfile {
  profileId: string
  metrics: ProfileMetricDef[]
  itVariant?: ItVariant
  description?: string
}

export function resolveInformationTechnologyVariant(
  profile: ProfileDef,
  itVariant?: ItVariant,
  subIndustryHint?: string,
): ItVariant {
  if (itVariant) return itVariant
  const sel = profile.variant_selection
  if (!sel) return 'software_saas'
  const hint = (subIndustryHint ?? '').toLowerCase()
  for (const [key, rule] of Object.entries(sel)) {
    const subs = rule.match_sub_industries_contains ?? []
    if (subs.some((s) => hint.includes(s.toLowerCase()))) {
      return key as ItVariant
    }
  }
  return 'software_saas'
}

export function resolveProfileMetrics(
  profileId: string,
  profile: ProfileDef,
  options?: { itVariant?: ItVariant; subIndustryHint?: string },
): ResolvedProfile {
  if (profile.variants && profileId === 'information_technology') {
    const v = resolveInformationTechnologyVariant(profile, options?.itVariant, options?.subIndustryHint)
    const block = profile.variants[v]
    return {
      profileId,
      metrics: block?.metrics ?? [],
      itVariant: v,
      description: profile.description,
    }
  }
  return {
    profileId,
    metrics: profile.metrics ?? [],
    description: profile.description,
  }
}
