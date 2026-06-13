import { describe, expect, it } from 'vitest'
import { resolveFairValueProfileId } from './resolveFairValueProfile'

describe('resolveFairValueProfileId', () => {
  it('maps IT to software_saas by default', () => {
    expect(resolveFairValueProfileId('information_technology')).toBe('software_saas')
    expect(resolveFairValueProfileId('information_technology', 'software_saas')).toBe('software_saas')
  })

  it('maps IT semis variant', () => {
    expect(resolveFairValueProfileId('information_technology', 'semis_hardware')).toBe('semis_hardware')
  })

  it('maps consumer profile for AMZN routing', () => {
    expect(resolveFairValueProfileId('consumer_staples_discretionary_general')).toBe(
      'consumer_staples_discretionary_general',
    )
  })

  it('maps banks profile', () => {
    expect(resolveFairValueProfileId('banks_thrifts')).toBe('banks_thrifts')
  })

  it('maps REIT profile', () => {
    expect(resolveFairValueProfileId('reits')).toBe('reits')
  })
})
