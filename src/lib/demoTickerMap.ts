import type { ItVariant } from '../types/sectorProfiles'

export interface DemoTickerMeta {
  name: string
  profileId: string
  itVariant?: ItVariant
  /** Hint for UI when using auto profile */
  subIndustryHint?: string
}

/** Curated demo routing — replace with live GICS from your data vendor later. */
export const DEMO_TICKERS: Record<string, DemoTickerMeta> = {
  JPM: { name: 'JPMorgan Chase', profileId: 'banks_thrifts' },
  BAC: { name: 'Bank of America', profileId: 'banks_thrifts' },
  WFC: { name: 'Wells Fargo', profileId: 'banks_thrifts' },
  PGR: { name: 'Progressive', profileId: 'insurance_general', subIndustryHint: 'Property & Casualty' },
  MET: { name: 'MetLife', profileId: 'insurance_general', subIndustryHint: 'Life' },
  BLK: { name: 'BlackRock', profileId: 'capital_markets_brokers_asset_managers' },
  SCHW: { name: 'Charles Schwab', profileId: 'capital_markets_brokers_asset_managers' },
  O: { name: 'Realty Income', profileId: 'reits' },
  PLD: { name: 'Prologis', profileId: 'reits' },
  DUK: { name: 'Duke Energy', profileId: 'utilities_electric_gas_water' },
  NEE: { name: 'NextEra Energy', profileId: 'utilities_electric_gas_water' },
  XOM: { name: 'Exxon Mobil', profileId: 'energy_exploration_production' },
  CVX: { name: 'Chevron', profileId: 'energy_exploration_production' },
  KMI: { name: 'Kinder Morgan', profileId: 'energy_midstream_integrated_refining' },
  NEM: { name: 'Newmont', profileId: 'materials_mining_chemicals_paper_packaging' },
  CAT: { name: 'Caterpillar', profileId: 'industrials_machinery_aerospace_transportation_construction' },
  DE: { name: 'Deere', profileId: 'industrials_machinery_aerospace_transportation_construction' },
  WMT: { name: 'Walmart', profileId: 'consumer_staples_discretionary_general' },
  PG: { name: 'Procter & Gamble', profileId: 'consumer_staples_discretionary_general' },
  UNH: { name: 'UnitedHealth', profileId: 'healthcare_pharma_medtech_services_tools' },
  JNJ: { name: 'Johnson & Johnson', profileId: 'healthcare_pharma_medtech_services_tools' },
  MSFT: {
    name: 'Microsoft',
    profileId: 'information_technology',
    itVariant: 'software_saas',
    subIndustryHint: 'Systems Software',
  },
  ORCL: {
    name: 'Oracle',
    profileId: 'information_technology',
    itVariant: 'software_saas',
    subIndustryHint: 'Application Software',
  },
  NVDA: {
    name: 'NVIDIA',
    profileId: 'information_technology',
    itVariant: 'semis_hardware',
    subIndustryHint: 'Semiconductors',
  },
  AMD: {
    name: 'Advanced Micro Devices',
    profileId: 'information_technology',
    itVariant: 'semis_hardware',
    subIndustryHint: 'Semiconductors',
  },
}

export const PROFILE_ORDER = [
  'banks_thrifts',
  'insurance_general',
  'capital_markets_brokers_asset_managers',
  'reits',
  'utilities_electric_gas_water',
  'energy_exploration_production',
  'energy_midstream_integrated_refining',
  'materials_mining_chemicals_paper_packaging',
  'industrials_machinery_aerospace_transportation_construction',
  'consumer_staples_discretionary_general',
  'healthcare_pharma_medtech_services_tools',
  'information_technology',
] as const
