import { softwareSaasAdapter } from './profiles/softwareSaasAdapter'
import { semisHardwareAdapter } from './profiles/semisHardwareAdapter'
import { createEvGeneralAdapter } from './profiles/createEvGeneralAdapter'
import { createEvCyclicalAdapter } from './profiles/createEvCyclicalAdapter'
import {
  createFinancialsBankAdapter,
  createFinancialsInsuranceAdapter,
} from './profiles/createFinancialsAdapter'
import { createReitAdapter } from './profiles/createReitAdapter'
import type { FairValueProfileAdapter, FairValueProfileId } from './types'

const ADAPTERS: Record<FairValueProfileId, FairValueProfileAdapter> = {
  software_saas: softwareSaasAdapter,
  semis_hardware: semisHardwareAdapter,
  consumer_staples_discretionary_general: createEvGeneralAdapter('consumer_staples_discretionary_general'),
  healthcare_pharma_medtech_services_tools: createEvGeneralAdapter('healthcare_pharma_medtech_services_tools'),
  industrials_machinery_aerospace_transportation_construction: createEvGeneralAdapter(
    'industrials_machinery_aerospace_transportation_construction',
  ),
  capital_markets_brokers_asset_managers: createEvGeneralAdapter('capital_markets_brokers_asset_managers'),
  utilities_electric_gas_water: createEvGeneralAdapter('utilities_electric_gas_water'),
  materials_mining_chemicals_paper_packaging: createEvCyclicalAdapter('materials_mining_chemicals_paper_packaging'),
  energy_exploration_production: createEvCyclicalAdapter('energy_exploration_production'),
  energy_midstream_integrated_refining: createEvCyclicalAdapter('energy_midstream_integrated_refining'),
  banks_thrifts: createFinancialsBankAdapter('banks_thrifts'),
  insurance_general: createFinancialsInsuranceAdapter('insurance_general'),
  reits: createReitAdapter('reits'),
}

export function getFairValueAdapter(profileId: FairValueProfileId): FairValueProfileAdapter {
  return ADAPTERS[profileId]
}
