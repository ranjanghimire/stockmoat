import type { ItVariant } from '../../types/sectorProfiles'
import type { FairValueProfileId } from './types'

export function resolveFairValueProfileId(
  profileId: string,
  itVariant?: ItVariant | string,
): FairValueProfileId | null {
  if (profileId !== 'information_technology') return null
  if (itVariant === 'software_saas' || itVariant === 'semis_hardware') {
    return itVariant
  }
  return null
}
