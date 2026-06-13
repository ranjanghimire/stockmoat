import { parse } from 'yaml'
import rawConfig from '../../../config/fair_value.v1.yaml?raw'
import type { FairValueConfigRoot } from './types'

let cached: FairValueConfigRoot | null = null

export function loadFairValueConfig(): FairValueConfigRoot {
  if (!cached) {
    cached = parse(rawConfig) as FairValueConfigRoot
  }
  return cached
}
