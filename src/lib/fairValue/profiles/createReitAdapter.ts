import type { FairValueProfileId } from '../types'
import { createStandardAdapter } from './configDrivenAdapter'

export function createReitAdapter(profileId: FairValueProfileId = 'reits') {
  return createStandardAdapter(profileId)
}
