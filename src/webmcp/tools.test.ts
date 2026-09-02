import { describe, expect, it } from 'vitest'
import { ROOM_TOOLS } from './tools'

describe('WebMCP tool surface', () => {
  it('registers at most six tools and never exposes settle/approve actions', () => {
    const names = ROOM_TOOLS.map((t) => t.name)
    expect(names.length).toBeLessThanOrEqual(6)
    expect(names).toEqual([
      'get_room_state',
      'set_specs',
      'classify_diff',
      'focus_case',
      'list_room',
      'export_migration_notes',
    ])
    const banned = ['approve_break', 'take_new', 'take_old', 'resolve_waiting', 'settle']
    for (const name of names) {
      expect(banned.some((b) => name.includes(b))).toBe(false)
    }
  })
})
