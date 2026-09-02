import type { DiffCase } from '../types'
import { HUMAN_ACKED } from '../types'
import { getRule } from './rules'

function statusLabel(status: DiffCase['status']): string {
  switch (status) {
    case 'acked-old':
      return 'human: take old'
    case 'acked-new':
      return 'human: take new'
    case 'acked-intentional':
      return 'human: intentional breaking change'
    default:
      return status
  }
}

export function waitingCases(cases: DiffCase[]): DiffCase[] {
  return cases.filter((c) => c.status === 'waiting')
}

export function mechanicalCounts(cases: DiffCase[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of cases) {
    if (item.status === 'auto-settled' || item.status === 'safe-additive') {
      counts[item.ruleId] = (counts[item.ruleId] ?? 0) + 1
    }
  }
  return counts
}

export function buildMigrationMarkdown(input: {
  oldTitle: string
  newTitle: string
  cases: DiffCase[]
}):
  | { ok: true; markdown: string }
  | { ok: false; code: 'BLOCKED_UNSETTLED'; error: string; waitingIds: string[] } {
  const waiting = waitingCases(input.cases)
  if (waiting.length) {
    return {
      ok: false,
      code: 'BLOCKED_UNSETTLED',
      error: `BLOCKED_UNSETTLED: ${waiting.length} breaking/ambiguous card(s) still waiting. A human must Take old, Take new, or Mark intentional on each. Agents cannot approve a break. Export includes only human-acked breaking cases plus mechanical summary counts.`,
      waitingIds: waiting.map((c) => c.id),
    }
  }

  const acked = input.cases.filter((c) => HUMAN_ACKED.includes(c.status))
  const counts = mechanicalCounts(input.cases)
  const mechanicalTotal = Object.values(counts).reduce((a, b) => a + b, 0)
  const now = new Date().toISOString()

  const lines: string[] = [
    '# OpenAPI migration notes',
    '',
    `Generated: ${now}`,
    `Old: ${input.oldTitle}`,
    `New: ${input.newTitle}`,
    '',
    'Export rule: human-acked breaking cases in full; mechanical/safe auto-settles as **counts only**.',
    'Waiting cards block export (`BLOCKED_UNSETTLED`). No tool can pick a breaking side.',
    '',
    '## Mechanical auto-settled (counts only)',
    '',
  ]

  if (!mechanicalTotal) {
    lines.push('_None._', '')
  } else {
    lines.push('| Rule | Count |', '| --- | ---: |')
    for (const [ruleId, n] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`| \`${ruleId}\` | ${n} |`)
    }
    lines.push('', `Total mechanical/safe: ${mechanicalTotal}. Snippets omitted — they are not the contract change.`, '')
  }

  lines.push('## Human-acked breaking', '')
  if (!acked.length) {
    lines.push('_None. No breaking cards were waiting, or none were acked._', '')
  } else {
    for (const item of acked) {
      const rule = getRule(item.ruleId)
      const op = item.method === 'SCHEMA' ? item.path : `${item.method} ${item.path}`
      lines.push(`### ${op}`, '')
      lines.push(`- Rule: \`${rule.id}\` — ${rule.title}`)
      lines.push(`- Status: ${statusLabel(item.status)}`)
      lines.push(`- Why: ${item.why}`)
      if (item.jsonPointer) lines.push(`- Pointer: \`${item.jsonPointer}\``)
      lines.push('', 'Old:', '', '```json', item.oldSnippet, '```', '')
      lines.push('New:', '', '```json', item.newSnippet, '```', '')
    }
  }

  return { ok: true, markdown: lines.join('\n') }
}

export function specTitle(doc: Record<string, unknown> | null, fallback: string): string {
  if (!doc) return fallback
  const info = doc.info
  if (info && typeof info === 'object' && !Array.isArray(info)) {
    const rec = info as Record<string, unknown>
    const title = typeof rec.title === 'string' ? rec.title : fallback
    const version = typeof rec.version === 'string' ? rec.version : ''
    return version ? `${title} ${version}` : title
  }
  return fallback
}
