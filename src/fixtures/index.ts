import v1 from './petstore-v1.yaml?raw'
import v2 from './petstore-v2.yaml?raw'
import injectionV1 from './injection-v1.yaml?raw'
import injectionV2 from './injection-v2.yaml?raw'

export const DEMO_FIXTURE_ID = 'demo'
export const INJECTION_FIXTURE_ID = 'injection'

export type FixtureId = 'demo' | 'injection'

export const DEMO_OLD_YAML = v1
export const DEMO_NEW_YAML = v2
export const INJECTION_OLD_YAML = injectionV1
export const INJECTION_NEW_YAML = injectionV2

export function fixturePair(id: FixtureId): { old: string; new: string; label: string } {
  if (id === 'injection') {
    return {
      old: INJECTION_OLD_YAML,
      new: INJECTION_NEW_YAML,
      label: 'Injection canary (v1 vs v2)',
    }
  }
  return {
    old: DEMO_OLD_YAML,
    new: DEMO_NEW_YAML,
    label: 'Petstore demo (v1 vs v2)',
  }
}
