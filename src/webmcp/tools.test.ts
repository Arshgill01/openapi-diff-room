import { describe, expect, it } from 'vitest'
import { ALWAYS_ON_TOOLS, ROOM_TOOLS, SCOPED_TOOLS } from './tools'
import { detectSettlementAttempt } from './guard'

describe('WebMCP tool surface', () => {
  it('never registers settle/approve verbs', () => {
    const names = ROOM_TOOLS.map((t) => t.name)
    expect(names).toEqual([
      'get_room_state',
      'load_fixture',
      'set_specs',
      'list_room',
      'classify_diff',
      'focus_case',
      'export_migration_notes',
    ])
    const banned = ['approve_break', 'take_new', 'take_old', 'resolve_waiting', 'settle']
    for (const name of names) {
      expect(banned.some((b) => name.includes(b))).toBe(false)
    }
  })

  it('scopes classify/focus/export separately from always-on tools', () => {
    expect(ALWAYS_ON_TOOLS.map((t) => t.name)).toEqual([
      'get_room_state',
      'load_fixture',
      'set_specs',
      'list_room',
    ])
    expect(SCOPED_TOOLS.map((t) => t.name)).toEqual([
      'classify_diff',
      'focus_case',
      'export_migration_notes',
    ])
  })

  it('marks spec-returning tools as untrusted', () => {
    const byName = Object.fromEntries(ROOM_TOOLS.map((t) => [t.name, t]))
    expect(byName.load_fixture.annotations?.untrustedContentHint).toBe(true)
    expect(byName.set_specs.annotations?.untrustedContentHint).toBe(true)
    expect(byName.focus_case.annotations?.untrustedContentHint).toBe(true)
  })
})

describe('settlement guard', () => {
  it('refuses take_new / approve_break style args with REQUIRES_HUMAN', () => {
    expect(detectSettlementAttempt('classify_diff', { take_new: true })?.code).toBe('REQUIRES_HUMAN')
    expect(detectSettlementAttempt('export_migration_notes', { approve_break: true })?.code).toBe(
      'REQUIRES_HUMAN',
    )
    expect(detectSettlementAttempt('take_new', {})?.code).toBe('REQUIRES_HUMAN')
    expect(detectSettlementAttempt('list_room', {})).toBeNull()
  })

  it('classify_diff returns a typed REQUIRES_HUMAN envelope instead of throwing', async () => {
    const tool = ROOM_TOOLS.find((t) => t.name === 'classify_diff')
    expect(tool).toBeTruthy()
    const result = await tool!.execute({ take_new: true })
    const payload = JSON.parse(result.content[0].text) as {
      ok: boolean
      error?: { code: string }
      roomStatus: unknown
      validNextActions: string[]
    }
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('REQUIRES_HUMAN')
    expect(payload.roomStatus).toBeTruthy()
    expect(payload.validNextActions.length).toBeGreaterThan(0)
  })
})
