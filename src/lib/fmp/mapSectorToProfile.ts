import type { ItVariant } from '../../types/sectorProfiles'

export interface FmpProfileRouting {
  profileId: string
  subIndustryHint: string
  itVariant?: ItVariant
}

export function mapFmpSectorToProfile(sector: string, industry: string): FmpProfileRouting {
  const s = sector.toLowerCase()
  const i = industry.toLowerCase()
  const hint = industry

  if (s.includes('financial')) {
    if (/(bank|thrifts|savings)/.test(i)) {
      return { profileId: 'banks_thrifts', subIndustryHint: hint }
    }
    if (/(insurance|reinsurance|underwriting)/.test(i)) {
      return { profileId: 'insurance_general', subIndustryHint: hint }
    }
    return { profileId: 'capital_markets_brokers_asset_managers', subIndustryHint: hint }
  }

  if (/(reit|real estate investment)/i.test(industry) || i.includes('reit')) {
    return { profileId: 'reits', subIndustryHint: hint }
  }

  if (s.includes('utilities')) {
    return { profileId: 'utilities_electric_gas_water', subIndustryHint: hint }
  }

  if (s.includes('energy')) {
    if (/(midstream|pipeline|oil & gas integrated|refin)/.test(i)) {
      return { profileId: 'energy_midstream_integrated_refining', subIndustryHint: hint }
    }
    return { profileId: 'energy_exploration_production', subIndustryHint: hint }
  }

  if (s.includes('materials')) {
    return { profileId: 'materials_mining_chemicals_paper_packaging', subIndustryHint: hint }
  }

  if (s.includes('industrials')) {
    return { profileId: 'industrials_machinery_aerospace_transportation_construction', subIndustryHint: hint }
  }

  if (s.includes('consumer')) {
    return { profileId: 'consumer_staples_discretionary_general', subIndustryHint: hint }
  }

  if (s.includes('health')) {
    return { profileId: 'healthcare_pharma_medtech_services_tools', subIndustryHint: hint }
  }

  if (s.includes('technology') || s.includes('information technology')) {
    const itVariant: ItVariant = /(semiconductor|electronic|hardware)/.test(i)
      ? 'semis_hardware'
      : 'software_saas'
    return { profileId: 'information_technology', subIndustryHint: hint, itVariant }
  }

  if (s.includes('communication')) {
    if (/(semiconductor|hardware|software|internet)/.test(i)) {
      const itVariant: ItVariant = /(semiconductor|electronic)/.test(i) ? 'semis_hardware' : 'software_saas'
      return { profileId: 'information_technology', subIndustryHint: hint, itVariant }
    }
    return { profileId: 'consumer_staples_discretionary_general', subIndustryHint: hint }
  }

  if (s.includes('real estate')) {
    return { profileId: 'reits', subIndustryHint: hint }
  }

  return { profileId: 'consumer_staples_discretionary_general', subIndustryHint: hint }
}
