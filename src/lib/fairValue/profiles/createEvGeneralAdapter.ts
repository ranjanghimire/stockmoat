import type { FairValueProfileId } from '../types'
import { createStandardAdapter } from './configDrivenAdapter'

export function createEvGeneralAdapter(profileId: FairValueProfileId) {
  return createStandardAdapter(profileId)
}
