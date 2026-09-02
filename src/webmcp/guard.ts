const FORBIDDEN_KEYS = new Set([
  'approve_break',
  'take_old',
  'take_new',
  'takeOld',
  'takeNew',
  'resolve_waiting',
  'resolveWaiting',
  'settle',
  'decision',
  'approve',
  'ack',
  'mark_intentional',
  'markIntentional',
  'intentional',
])

const FORBIDDEN_VALUES = new Set([
  'take_old',
  'take_new',
  'take old',
  'take new',
  'approve_break',
  'approve',
  'ack',
  'intentional',
  'mark_intentional',
  'resolve_waiting',
  'settle',
])

/**
 * Detect an agent trying to pick a breaking side through extra args.
 * No registered tool settles waiting cards; this is a typed recovery path.
 */
export function detectSettlementAttempt(
  toolName: string,
  args: Record<string, unknown> | undefined,
): { code: 'REQUIRES_HUMAN'; message: string; keys: string[] } | null {
  const name = toolName.toLowerCase().replace(/-/g, '_')
  if (
    name.includes('approve_break') ||
    name === 'take_new' ||
    name === 'take_old' ||
    name.includes('resolve_waiting')
  ) {
    return {
      code: 'REQUIRES_HUMAN',
      message: `Tool "${toolName}" is not registered. Breaking cases are human-only (Take old / Take new / Mark intentional).`,
      keys: [toolName],
    }
  }
  if (!args || typeof args !== 'object') return null
  const keys: string[] = []
  for (const [key, value] of Object.entries(args)) {
    const k = key.replace(/-/g, '_')
    if (FORBIDDEN_KEYS.has(k) || FORBIDDEN_KEYS.has(key)) {
      keys.push(key)
      continue
    }
    if (typeof value === 'string' && FORBIDDEN_VALUES.has(value.trim().toLowerCase())) {
      keys.push(`${key}=${value}`)
    }
  }
  if (!keys.length) return null
  return {
    code: 'REQUIRES_HUMAN',
    message: `Refused. Extra argument(s) ${keys.join(', ')} would settle a breaking side. Only a human click on the waiting card can do that.`,
    keys,
  }
}

export function summarizeArgs(args: Record<string, unknown> | undefined): string {
  if (!args || !Object.keys(args).length) return '{}'
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > 48) {
      out[key] = `${value.slice(0, 48)}…`
    } else {
      out[key] = value
    }
  }
  try {
    const text = JSON.stringify(out)
    return text.length > 180 ? `${text.slice(0, 180)}…` : text
  } catch {
    return '{?}'
  }
}
