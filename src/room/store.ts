import { useSyncExternalStore } from 'react'
import { classifyDocs, sortCases } from '../diff/classify'
import { buildMigrationMarkdown, specTitle } from '../diff/export'
import { INJECTION_PAYLOAD, mergeInjectionHits, scanInjection } from '../diff/injection'
import { fingerprint } from '../diff/normalize'
import { parseSpec } from '../diff/parse'
import { fixturePair } from '../fixtures'
import type { FixtureId } from '../fixtures'
import type { CaseStatus, DiffCase, InjectionState, LogEntry, LogOutcome, RefusalState } from '../types'
import { HUMAN_ACKED } from '../types'
import type { Envelope, EnvelopeError, RoomStatus } from '../webmcp/envelope'
import { ErrorCode } from '../webmcp/envelope'
import { detectSettlementAttempt, summarizeArgs } from '../webmcp/guard'

const STORAGE_KEY = 'openapi-diff-room.v2'
const MAX_LOG = 80

export type RoomState = {
  oldText: string
  newText: string
  oldDoc: Record<string, unknown> | null
  newDoc: Record<string, unknown> | null
  parseError: string | null
  parseWarning: string | null
  cases: DiffCase[]
  classifiedAt: string | null
  specsFingerprint: string | null
  focusedId: string | null
  activity: LogEntry[]
  exportMarkdown: string | null
  exportError: string | null
  webmcpPresent: boolean
  webmcpToolCount: number
  lastExportAt: string | null
  injection: InjectionState | null
  lastRefusal: RefusalState | null
  pulseWaiting: boolean
  loadedFixture: FixtureId | null
}

function emptyState(): RoomState {
  return {
    oldText: '',
    newText: '',
    oldDoc: null,
    newDoc: null,
    parseError: null,
    parseWarning: null,
    cases: [],
    classifiedAt: null,
    specsFingerprint: null,
    focusedId: null,
    activity: [],
    exportMarkdown: null,
    exportError: null,
    webmcpPresent: false,
    webmcpToolCount: 0,
    lastExportAt: null,
    injection: null,
    lastRefusal: null,
    pulseWaiting: false,
    loadedFixture: null,
  }
}

let state: RoomState = loadState()
const listeners = new Set<() => void>()

function loadState(): RoomState {
  const base = emptyState()
  if (typeof localStorage === 'undefined') return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<RoomState>
    return {
      ...base,
      oldText: parsed.oldText ?? '',
      newText: parsed.newText ?? '',
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      classifiedAt: parsed.classifiedAt ?? null,
      specsFingerprint: parsed.specsFingerprint ?? null,
      activity: Array.isArray(parsed.activity) ? parsed.activity.slice(0, MAX_LOG) : [],
      exportMarkdown: parsed.exportMarkdown ?? null,
      injection: parsed.injection ?? null,
      loadedFixture: parsed.loadedFixture ?? null,
    }
  } catch {
    return base
  }
}

function persist(next: RoomState) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        oldText: next.oldText,
        newText: next.newText,
        cases: next.cases,
        classifiedAt: next.classifiedAt,
        specsFingerprint: next.specsFingerprint,
        activity: next.activity.slice(0, 40),
        exportMarkdown: next.exportMarkdown,
        injection: next.injection,
        loadedFixture: next.loadedFixture,
      }),
    )
  } catch {
    /* quota */
  }
}

function emit(next: RoomState) {
  state = next
  persist(next)
  listeners.forEach((fn) => fn())
}

function patch(partial: Partial<RoomState> | ((current: RoomState) => RoomState)) {
  const next = typeof partial === 'function' ? partial(state) : { ...state, ...partial }
  emit(next)
}

function nowIso() {
  return new Date().toISOString()
}

let logSeq = 0
function makeLog(entry: Omit<LogEntry, 'id' | 'at'>): LogEntry {
  logSeq += 1
  return { id: `log-${Date.now()}-${logSeq}`, at: nowIso(), ...entry }
}

function prependLog(entry: Omit<LogEntry, 'id' | 'at'>) {
  patch({ activity: [makeLog(entry), ...state.activity].slice(0, MAX_LOG) })
}

export function getRoomState(): RoomState {
  return state
}

export function subscribeRoom(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRoom(): RoomState {
  return useSyncExternalStore(subscribeRoom, getRoomState, getRoomState)
}

export function setWebmcpStatus(present: boolean, toolCount: number) {
  if (state.webmcpPresent === present && state.webmcpToolCount === toolCount) return
  patch({ webmcpPresent: present, webmcpToolCount: toolCount })
}

export function specsAreLoaded(): boolean {
  return Boolean(state.oldText.trim() && state.newText.trim())
}

export function countsOf(cases: DiffCase[]) {
  return {
    waiting: cases.filter((c) => c.status === 'waiting').length,
    safe: cases.filter((c) => c.status === 'safe-additive').length,
    settled: cases.filter((c) => c.status === 'auto-settled').length,
    acked: cases.filter((c) => HUMAN_ACKED.includes(c.status)).length,
  }
}

export function snapshotRoomStatus(): RoomStatus {
  const counts = countsOf(state.cases)
  return {
    specsLoaded: specsAreLoaded(),
    classified: Boolean(state.classifiedAt && !state.parseError),
    webmcpPresent: state.webmcpPresent,
    toolCount: state.webmcpToolCount,
    injectionIgnored: Boolean(state.injection?.ignored),
    counts: {
      waiting: counts.waiting,
      settled: counts.settled,
      safe: counts.safe,
      acked: counts.acked,
      total: state.cases.length,
    },
    waitingIds: state.cases.filter((c) => c.status === 'waiting').map((c) => c.id),
  }
}

export function validNextActions(status: RoomStatus = snapshotRoomStatus()): string[] {
  const actions = ['get_room_state', 'list_room', 'load_fixture', 'set_specs']
  if (status.specsLoaded) {
    actions.push('classify_diff', 'focus_case')
    if (status.counts.waiting > 0) {
      actions.push('HUMAN: Take old | Take new | Mark intentional (breaking)')
    } else if (status.classified) {
      actions.push('export_migration_notes')
    }
  } else {
    actions.push('load_fixture fixture=demo')
  }
  return actions
}

export function buildEnvelope<T>(
  ok: boolean,
  opts: {
    data?: T
    error?: EnvelopeError
    note_to_agent?: string
  } = {},
): Envelope<T> {
  const roomStatus = snapshotRoomStatus()
  const env: Envelope<T> = {
    ok,
    roomStatus,
    validNextActions: validNextActions(roomStatus),
  }
  if (ok) env.data = opts.data
  else env.error = opts.error
  if (opts.note_to_agent) env.note_to_agent = opts.note_to_agent
  return env
}

export function summarizeCases(cases: DiffCase[]) {
  return cases.map((c) => ({
    id: c.id,
    status: c.status,
    ruleId: c.ruleId,
    method: c.method,
    path: c.path,
    why: c.why,
  }))
}

function applyInjection(oldDoc: Record<string, unknown>, newDoc: Record<string, unknown>): InjectionState | null {
  const hits = mergeInjectionHits(scanInjection(oldDoc, 'old'), scanInjection(newDoc, 'new'))
  if (!hits.length) return null
  return {
    ignored: true,
    payload: INJECTION_PAYLOAD,
    locations: hits.map((h) => h.path),
  }
}

export function setSpecText(side: 'old' | 'new', text: string) {
  patch(
    side === 'old'
      ? { oldText: text, exportMarkdown: null, exportError: null, lastRefusal: null }
      : { newText: text, exportMarkdown: null, exportError: null, lastRefusal: null },
  )
}

function runClassify(source: string, tool?: string, argsSummary?: string) {
  const fp = fingerprint(state.oldText, state.newText)
  if (state.specsFingerprint === fp && state.cases.length > 0 && !state.parseError) {
    const counts = countsOf(state.cases)
    prependLog({
      kind: 'tool',
      title: source,
      detail: `Idempotent classify. settled=${counts.settled} safe=${counts.safe} waiting=${counts.waiting}`,
      tool: tool ?? 'classify_diff',
      argsSummary,
      outcome: 'accepted',
      code: 'idempotent',
    })
    return {
      ok: true as const,
      idempotent: true,
      fingerprint: fp,
      counts,
      injectionIgnored: Boolean(state.injection?.ignored),
      autoSettled: summarizeCases(state.cases.filter((c) => c.status === 'auto-settled')),
      safeAdditive: summarizeCases(state.cases.filter((c) => c.status === 'safe-additive')),
      waiting: summarizeCases(state.cases.filter((c) => c.status === 'waiting')),
    }
  }

  const oldParsed = parseSpec(state.oldText, 'Old')
  const newParsed = parseSpec(state.newText, 'New')
  if (!oldParsed.ok || !newParsed.ok) {
    const message = [!oldParsed.ok ? oldParsed.error : '', !newParsed.ok ? newParsed.error : '']
      .filter(Boolean)
      .join(' ')
    patch({
      parseError: message,
      parseWarning: null,
      oldDoc: null,
      newDoc: null,
      cases: [],
      classifiedAt: null,
      specsFingerprint: fp,
      exportMarkdown: null,
      exportError: null,
      injection: null,
      lastRefusal: null,
      activity: [
        makeLog({
          kind: 'tool',
          title: source,
          detail: message,
          tool: tool ?? 'classify_diff',
          argsSummary,
          outcome: 'refused',
          code: ErrorCode.PARSE_FAILED,
        }),
        ...state.activity,
      ].slice(0, MAX_LOG),
    })
    return {
      ok: false as const,
      error: message,
      code: ErrorCode.PARSE_FAILED,
      idempotent: false,
      fingerprint: fp,
      counts: countsOf([]),
      injectionIgnored: false,
      autoSettled: [],
      safeAdditive: [],
      waiting: [],
    }
  }

  const injection = applyInjection(oldParsed.doc, newParsed.doc)
  const cases = sortCases(classifyDocs(oldParsed.doc, newParsed.doc))
  const warning = [oldParsed.warning, newParsed.warning].filter(Boolean).join(' ') || null
  const counts = countsOf(cases)
  const injectionNote = injection
    ? ` Injection payload ignored (${injection.locations.length} hit(s)); classification used the rule table only.`
    : ''
  patch({
    oldDoc: oldParsed.doc,
    newDoc: newParsed.doc,
    parseError: null,
    parseWarning: warning,
    cases,
    classifiedAt: nowIso(),
    specsFingerprint: fp,
    exportMarkdown: null,
    exportError: null,
    focusedId: null,
    injection,
    lastRefusal: null,
    pulseWaiting: false,
    activity: [
      makeLog({
        kind: source.startsWith('tool:') ? 'tool' : 'human',
        title: source,
        detail: `Classified ${cases.length} cases. mechanical=${counts.settled} safe=${counts.safe} waiting=${counts.waiting}.${injectionNote}`,
        tool: tool ?? (source.startsWith('tool:') ? 'classify_diff' : undefined),
        argsSummary,
        outcome: 'accepted',
        code: injection ? 'INJECTION_IGNORED' : 'classified',
      }),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return {
    ok: true as const,
    idempotent: false,
    fingerprint: fp,
    counts,
    injectionIgnored: Boolean(injection?.ignored),
    injectionLocations: injection?.locations ?? [],
    autoSettled: summarizeCases(cases.filter((c) => c.status === 'auto-settled')),
    safeAdditive: summarizeCases(cases.filter((c) => c.status === 'safe-additive')),
    waiting: summarizeCases(cases.filter((c) => c.status === 'waiting')),
  }
}

export function loadFixture(id: FixtureId, source?: string) {
  const pair = fixturePair(id)
  const title = source ?? `load_fixture ${id}`
  patch({
    oldText: pair.old,
    newText: pair.new,
    cases: [],
    specsFingerprint: null,
    classifiedAt: null,
    exportMarkdown: null,
    exportError: null,
    parseError: null,
    focusedId: null,
    loadedFixture: id,
    lastRefusal: null,
    pulseWaiting: false,
    injection: null,
    activity: [
      makeLog({
        kind: title.startsWith('tool:') || title.startsWith('load_fixture') ? 'tool' : 'human',
        title,
        detail: `Loaded ${pair.label}. Room cleared.`,
        tool: 'load_fixture',
        argsSummary: JSON.stringify({ fixture: id }),
        outcome: 'accepted',
        code: 'loaded',
      }),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return runClassify(title, 'load_fixture', JSON.stringify({ fixture: id }))
}

export function loadDemoPair(source = 'human: Load demo pair') {
  return loadFixture('demo', source)
}

export function setSpecs(oldText: string, newText: string, source = 'tool: set_specs') {
  patch({
    oldText,
    newText,
    cases: [],
    specsFingerprint: null,
    classifiedAt: null,
    exportMarkdown: null,
    exportError: null,
    parseError: null,
    focusedId: null,
    loadedFixture: null,
    lastRefusal: null,
    pulseWaiting: false,
    injection: null,
    activity: [
      makeLog({
        kind: 'tool',
        title: source,
        detail: 'Specs replaced. Room cleared and reclassified.',
        tool: 'set_specs',
        argsSummary: summarizeArgs({ old: oldText, new: newText }),
        outcome: 'accepted',
        code: 'loaded',
      }),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return runClassify(source, 'set_specs', summarizeArgs({ old: oldText, new: newText }))
}

export function classifyDiff(source = 'human: Classify') {
  if (!specsAreLoaded()) {
    prependLog({
      kind: 'tool',
      title: source,
      detail: 'Both specs must be loaded first.',
      tool: 'classify_diff',
      argsSummary: '{}',
      outcome: 'refused',
      code: ErrorCode.SPECS_REQUIRED,
    })
    return {
      ok: false as const,
      error: 'Both specs must be loaded first.',
      code: ErrorCode.SPECS_REQUIRED,
      idempotent: false,
      fingerprint: '',
      counts: countsOf([]),
      injectionIgnored: false,
      autoSettled: [],
      safeAdditive: [],
      waiting: [],
    }
  }
  return runClassify(source, 'classify_diff', '{}')
}

export function focusCase(input: { caseId?: string; path?: string; method?: string }, source = 'tool: focus_case') {
  const method = input.method?.toUpperCase()
  const match =
    (input.caseId ? state.cases.find((c) => c.id === input.caseId) : undefined) ??
    state.cases.find((c) => {
      const pathOk = input.path ? c.path === input.path : true
      const methodOk = method ? c.method === method : true
      return pathOk && methodOk
    })
  if (!match) {
    prependLog({
      kind: 'tool',
      title: source,
      detail: 'No case matched that path/method/id.',
      tool: 'focus_case',
      argsSummary: summarizeArgs(input as Record<string, unknown>),
      outcome: 'refused',
      code: ErrorCode.NOT_FOUND,
    })
    return { ok: false as const, error: 'No case matched that path/method/id. Load specs and classify first.', code: ErrorCode.NOT_FOUND }
  }
  patch({
    focusedId: match.id,
    lastRefusal: null,
    activity: [
      makeLog({
        kind: 'tool',
        title: source,
        detail: `Focused ${match.method} ${match.path} (${match.ruleId})`,
        tool: 'focus_case',
        argsSummary: summarizeArgs(input as Record<string, unknown>),
        outcome: 'accepted',
        code: match.ruleId,
      }),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return { ok: true as const, case: match }
}

export function humanSettle(
  id: string,
  decision: 'old' | 'new' | 'intentional',
): { ok: true; case: DiffCase } | { ok: false; error: string } {
  const current = state.cases.find((c) => c.id === id)
  if (!current) return { ok: false, error: 'Unknown case id.' }
  if (current.status !== 'waiting') {
    return { ok: false, error: 'Only waiting cards can be settled from the UI.' }
  }
  const status: CaseStatus =
    decision === 'old' ? 'acked-old' : decision === 'new' ? 'acked-new' : 'acked-intentional'
  const label =
    decision === 'old' ? 'Take old' : decision === 'new' ? 'Take new' : 'Mark intentional (breaking)'
  const nextCases = state.cases.map((c) =>
    c.id === id ? { ...c, status, decidedBy: 'human' as const, decidedAt: nowIso() } : c,
  )
  patch({
    cases: sortCases(nextCases),
    exportMarkdown: null,
    exportError: null,
    lastRefusal: null,
    pulseWaiting: false,
    activity: [
      makeLog({
        kind: 'human',
        title: `${label} · ${current.method} ${current.path}`,
        detail: current.ruleId,
        outcome: 'human',
        code: current.ruleId,
      }),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  const updated = nextCases.find((c) => c.id === id)
  return { ok: true, case: updated! }
}

export function exportNotes(source = 'human: Export notes') {
  if (!specsAreLoaded()) {
    const error = {
      code: ErrorCode.SPECS_REQUIRED,
      message: 'Load two specs before exporting.',
    }
    markRefusal('export_migration_notes', error)
    return { ok: false as const, code: ErrorCode.SPECS_REQUIRED, error: error.message, waitingIds: [] as string[] }
  }
  const result = buildMigrationMarkdown({
    oldTitle: specTitle(state.oldDoc, 'Old spec'),
    newTitle: specTitle(state.newDoc, 'New spec'),
    cases: state.cases,
  })
  if (!result.ok) {
    markRefusal('export_migration_notes', {
      code: result.code,
      message: result.error,
      waitingIds: result.waitingIds,
    })
    patch({ exportError: result.error, exportMarkdown: null })
    return result
  }
  patch({
    exportMarkdown: result.markdown,
    exportError: null,
    lastExportAt: nowIso(),
    lastRefusal: null,
    pulseWaiting: false,
    activity: [
      makeLog({
        kind: source.startsWith('tool:') ? 'tool' : 'human',
        title: source,
        detail: 'Exported human-acked breaking cases + mechanical counts only.',
        tool: 'export_migration_notes',
        argsSummary: '{}',
        outcome: 'accepted',
        code: 'exported',
      }),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return result
}

export function markRefusal(tool: string, error: EnvelopeError, argsSummary = '{}') {
  const refusal: RefusalState = {
    code: error.code,
    message: error.message,
    tool,
    at: nowIso(),
  }
  const pulse = error.code === ErrorCode.REQUIRES_HUMAN || error.code === ErrorCode.BLOCKED_UNSETTLED
  patch({
    lastRefusal: refusal,
    pulseWaiting: pulse,
    exportError: error.code === ErrorCode.BLOCKED_UNSETTLED ? error.message : state.exportError,
    activity: [
      makeLog({
        kind: 'tool',
        title: `tool: ${tool}`,
        detail: error.message,
        tool,
        argsSummary,
        outcome: 'refused',
        code: error.code,
      }),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
}

export function refuseSettlementAttempt(tool: string, args: Record<string, unknown>): Envelope<never> {
  const detected = detectSettlementAttempt(tool, args) ?? {
    code: 'REQUIRES_HUMAN' as const,
    message: 'Refused. Breaking sides are human-only.',
    keys: [],
  }
  markRefusal(tool, { code: ErrorCode.REQUIRES_HUMAN, message: detected.message, details: { keys: detected.keys } }, summarizeArgs(args))
  return buildEnvelope(false, {
    error: { code: ErrorCode.REQUIRES_HUMAN, message: detected.message, details: { keys: detected.keys } },
    note_to_agent:
      'Do not retry with take_new / take_old / approve. Call list_room, tell the human which waiting ids remain, and wait. After they click, call list_room then export_migration_notes.',
  })
}

/** Judge-path control: pretend an agent called take_new. Always refuses. */
export function simulateAgentSettleAttempt() {
  return refuseSettlementAttempt('take_new', { take_new: true, caseId: state.cases.find((c) => c.status === 'waiting')?.id ?? 'unknown' })
}

export function listRoomPayload() {
  const counts = countsOf(state.cases)
  return {
    classifiedAt: state.classifiedAt,
    fingerprint: state.specsFingerprint,
    parseError: state.parseError,
    injection: state.injection,
    lastRefusal: state.lastRefusal,
    loadedFixture: state.loadedFixture,
    counts: {
      settled: counts.settled,
      safe: counts.safe,
      waiting: counts.waiting,
      acked: counts.acked,
      total: state.cases.length,
    },
    cases: state.cases.map((c) => ({
      id: c.id,
      status: c.status,
      ruleId: c.ruleId,
      method: c.method,
      path: c.path,
      jsonPointer: c.jsonPointer,
      why: c.why,
      decidedBy: c.decidedBy ?? null,
      decidedAt: c.decidedAt ?? null,
    })),
  }
}

export function hydrateParsedDocs() {
  if (!state.oldText.trim() || !state.newText.trim()) return
  const oldParsed = parseSpec(state.oldText, 'Old')
  const newParsed = parseSpec(state.newText, 'New')
  if (oldParsed.ok && newParsed.ok) {
    patch({
      oldDoc: oldParsed.doc,
      newDoc: newParsed.doc,
      parseError: null,
      parseWarning: [oldParsed.warning, newParsed.warning].filter(Boolean).join(' ') || null,
      injection: applyInjection(oldParsed.doc, newParsed.doc),
    })
  }
}

export function logAccepted(tool: string, detail: string, argsSummary: string, code: string) {
  prependLog({
    kind: 'tool',
    title: `tool: ${tool}`,
    detail,
    tool,
    argsSummary,
    outcome: 'accepted' as LogOutcome,
    code,
  })
}

export { detectSettlementAttempt, summarizeArgs }
