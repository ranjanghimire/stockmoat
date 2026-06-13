import { softwareSaasAdapter } from './profiles/softwareSaasAdapter'
import { semisHardwareAdapter } from './profiles/semisHardwareAdapter'
import type { FairValueProfileAdapter, FairValueProfileId } from './types'

const ADAPTERS: Record<FairValueProfileId, FairValueProfileAdapter> = {
  software_saas: softwareSaasAdapter,
  semis_hardware: semisHardwareAdapter,
}

export function getFairValueAdapter(profileId: FairValueProfileId): FairValueProfileAdapter {
  return ADAPTERS[profileId]
}
