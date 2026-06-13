import type { ItVariant } from '../../types/sectorProfiles'
import { SUPPORTED_FAIR_VALUE_PROFILES, type FairValueProfileId } from './types'

const SUPPORTED = new Set<string>(SUPPORTED_FAIR_VALUE_PROFILES)

export function resolveFairValueProfileId(
  profileId: string,
  itVariant?: ItVariant | string,
): FairValueProfileId | null {
  if (profileId === 'information_technology') {
    const variant = itVariant === 'semis_hardware' ? 'semis_hardware' : 'software_saas'
    return variant
  }
  if (SUPPORTED.has(profileId)) {
    return profileId as FairValueProfileId
  }
  return null
}
