import type { DiffCase } from '../types'
import { HUMAN_ACKED } from '../types'
import { getRule } from './rules'

function statusLabel(status: DiffCase['status']): string {
  switch (status) {
    case 'auto-settled':
      return 'auto-settled (mechanical)'
    case 'safe-additive':
      return 'safe additive (auto-settled)'
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

export function exportableCases(cases: DiffCase[]): DiffCase[] {
  return cases.filter((c) => c.status !== 'waiting')
}

export function buildMigrationMarkdown(input: {
  oldTitle: string
  newTitle: string
  cases: DiffCase[]
}): { ok: true; markdown: string } | { ok: false; error: string; waitingIds: string[] } {
  const waiting = waitingCases(input.cases)
  if (waiting.length) {
    return {
      ok: false,
      error: `export_refused: ${waiting.length} waiting card(s) still open. A human must Take old, Take new, or Mark intentional (breaking) on each. No tool can approve a breaking change.`,
      waitingIds: waiting.map((c) => c.id),
    }
  }

  const safe = input.cases.filter((c) => c.status === 'safe-additive')
  const mechanical = input.cases.filter((c) => c.status === 'auto-settled')
  const acked = input.cases.filter((c) => HUMAN_ACKED.includes(c.status))
  const now = new Date().toISOString()

  const lines: string[] = [
    '# OpenAPI migration notes',
    '',
    `Generated: ${now}`,
    `Old: ${input.oldTitle}`,
    `New: ${input.newTitle}`,
    '',
    'These notes include auto-settled mechanical/safe changes and human-acked waiting cards only.',
    'Waiting cards cannot be exported until a human settles them. Agents cannot settle waiting cards.',
    '',
  ]

  const section = (title: string, list: DiffCase[]) => {
    lines.push(`## ${title}`)
    lines.push('')
    if (!list.length) {
      lines.push('_None._')
      lines.push('')
      return
    }
    for (const item of list) {
      const rule = getRule(item.ruleId)
      const op = item.method === 'SCHEMA' ? item.path : `${item.method} ${item.path}`
      lines.push(`### ${op}`)
      lines.push('')
      lines.push(`- Rule: \`${rule.id}\` — ${rule.title}`)
      lines.push(`- Status: ${statusLabel(item.status)}`)
      lines.push(`- Why: ${item.why}`)
      if (item.jsonPointer) lines.push(`- Pointer: \`${item.jsonPointer}\``)
      lines.push('')
      lines.push('Old:')
      lines.push('')
      lines.push('```json')
      lines.push(item.oldSnippet)
      lines.push('```')
      lines.push('')
      lines.push('New:')
      lines.push('')
      lines.push('```json')
      lines.push(item.newSnippet)
      lines.push('```')
      lines.push('')
    }
  }

  section('Safe additive (auto-settled)', safe)
  section('Mechanical (auto-settled)', mechanical)
  section('Human-acked', acked)

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
