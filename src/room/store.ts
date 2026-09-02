import { useSyncExternalStore } from 'react'
import { classifyDocs, sortCases } from '../diff/classify'
import { buildMigrationMarkdown, specTitle } from '../diff/export'
import { fingerprint } from '../diff/normalize'
import { parseSpec } from '../diff/parse'
import { DEMO_NEW_YAML, DEMO_OLD_YAML } from '../fixtures'
import type { CaseStatus, DiffCase, LogEntry } from '../types'
import { HUMAN_ACKED } from '../types'

const STORAGE_KEY = 'openapi-diff-room.v1'
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
function pushLog(kind: LogEntry['kind'], title: string, detail?: string): LogEntry {
  logSeq += 1
  return {
    id: `log-${Date.now()}-${logSeq}`,
    at: nowIso(),
    kind,
    title,
    detail,
  }
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
  patch({ webmcpPresent: present, webmcpToolCount: toolCount })
}

export function setSpecText(side: 'old' | 'new', text: string) {
  patch(side === 'old' ? { oldText: text, exportMarkdown: null, exportError: null } : { newText: text, exportMarkdown: null, exportError: null })
}

export function countsOf(cases: DiffCase[]) {
  return {
    waiting: cases.filter((c) => c.status === 'waiting').length,
    safe: cases.filter((c) => c.status === 'safe-additive').length,
    settled: cases.filter((c) => c.status === 'auto-settled').length,
    acked: cases.filter((c) => HUMAN_ACKED.includes(c.status)).length,
  }
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

type ClassifyResult = {
  ok: boolean
  error?: string
  idempotent: boolean
  fingerprint: string
  counts: ReturnType<typeof countsOf>
  autoSettled: ReturnType<typeof summarizeCases>
  safeAdditive: ReturnType<typeof summarizeCases>
  waiting: ReturnType<typeof summarizeCases>
}

function runClassify(source: string): ClassifyResult {
  const fp = fingerprint(state.oldText, state.newText)
  if (
    state.specsFingerprint === fp &&
    state.cases.length > 0 &&
    !state.parseError
  ) {
    const counts = countsOf(state.cases)
    patch({
      activity: [
        pushLog('tool', source, `Idempotent classify. settled=${counts.settled} safe=${counts.safe} waiting=${counts.waiting}`),
        ...state.activity,
      ].slice(0, MAX_LOG),
    })
    return {
      ok: true,
      idempotent: true,
      fingerprint: fp,
      counts,
      autoSettled: summarizeCases(state.cases.filter((c) => c.status === 'auto-settled')),
      safeAdditive: summarizeCases(state.cases.filter((c) => c.status === 'safe-additive')),
      waiting: summarizeCases(state.cases.filter((c) => c.status === 'waiting')),
    }
  }

  const oldParsed = parseSpec(state.oldText, 'Old')
  const newParsed = parseSpec(state.newText, 'New')
  if (!oldParsed.ok || !newParsed.ok) {
    const error = [!oldParsed.ok ? oldParsed.error : '', !newParsed.ok ? newParsed.error : '']
      .filter(Boolean)
      .join(' ')
    patch({
      parseError: error,
      parseWarning: null,
      oldDoc: null,
      newDoc: null,
      cases: [],
      classifiedAt: null,
      specsFingerprint: fp,
      exportMarkdown: null,
      exportError: null,
      activity: [pushLog('system', source, error), ...state.activity].slice(0, MAX_LOG),
    })
    return { ok: false, error, idempotent: false, fingerprint: fp, counts: countsOf([]), autoSettled: [], safeAdditive: [], waiting: [] }
  }

  const cases = sortCases(classifyDocs(oldParsed.doc, newParsed.doc))
  const warning = [oldParsed.warning, newParsed.warning].filter(Boolean).join(' ') || null
  const counts = countsOf(cases)
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
    activity: [
      pushLog(
        source.startsWith('tool:') ? 'tool' : 'human',
        source,
        `Classified ${cases.length} cases. mechanical=${counts.settled} safe=${counts.safe} waiting=${counts.waiting}`,
      ),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return {
    ok: true,
    idempotent: false,
    fingerprint: fp,
    counts,
    autoSettled: summarizeCases(cases.filter((c) => c.status === 'auto-settled')),
    safeAdditive: summarizeCases(cases.filter((c) => c.status === 'safe-additive')),
    waiting: summarizeCases(cases.filter((c) => c.status === 'waiting')),
  }
}

export function loadDemoPair(source = 'human: Load demo pair'): ClassifyResult {
  patch({
    oldText: DEMO_OLD_YAML,
    newText: DEMO_NEW_YAML,
    cases: [],
    specsFingerprint: null,
    classifiedAt: null,
    exportMarkdown: null,
    exportError: null,
    parseError: null,
    focusedId: null,
    activity: [pushLog(source.startsWith('tool:') ? 'tool' : 'human', source, 'Loaded Petstore v1 vs v2 demo pair. Room cleared.'), ...state.activity].slice(0, MAX_LOG),
  })
  return runClassify(source)
}

export function setSpecs(oldText: string, newText: string, source = 'tool: set_specs'): ClassifyResult {
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
    activity: [pushLog('tool', source, 'Specs replaced. Room cleared and reclassified.'), ...state.activity].slice(0, MAX_LOG),
  })
  return runClassify(source)
}

export function classifyDiff(source = 'human: Classify'): ClassifyResult {
  return runClassify(source)
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
    const error = 'No case matched that path/method/id. Load specs and classify first.'
    patch({
      activity: [pushLog('tool', source, error), ...state.activity].slice(0, MAX_LOG),
    })
    return { ok: false as const, error }
  }
  patch({
    focusedId: match.id,
    activity: [
      pushLog('tool', source, `Focused ${match.method} ${match.path} (${match.ruleId})`),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return {
    ok: true as const,
    case: match,
  }
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
    decision === 'old'
      ? 'Take old'
      : decision === 'new'
        ? 'Take new'
        : 'Mark intentional (breaking)'
  const nextCases = state.cases.map((c) =>
    c.id === id
      ? { ...c, status, decidedBy: 'human' as const, decidedAt: nowIso() }
      : c,
  )
  patch({
    cases: sortCases(nextCases),
    exportMarkdown: null,
    exportError: null,
    activity: [
      pushLog('human', `${label} · ${current.method} ${current.path}`, current.ruleId),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  const updated = nextCases.find((c) => c.id === id)
  return { ok: true, case: updated! }
}

export function exportNotes(source = 'human: Export notes') {
  const result = buildMigrationMarkdown({
    oldTitle: specTitle(state.oldDoc, 'Old spec'),
    newTitle: specTitle(state.newDoc, 'New spec'),
    cases: state.cases,
  })
  if (!result.ok) {
    patch({
      exportError: result.error,
      exportMarkdown: null,
      activity: [pushLog(source.startsWith('tool:') ? 'tool' : 'human', source, result.error), ...state.activity].slice(0, MAX_LOG),
    })
    return result
  }
  patch({
    exportMarkdown: result.markdown,
    exportError: null,
    lastExportAt: nowIso(),
    activity: [
      pushLog(source.startsWith('tool:') ? 'tool' : 'human', source, 'Exported migration notes from settled + human-acked cases.'),
      ...state.activity,
    ].slice(0, MAX_LOG),
  })
  return result
}

export function listRoomPayload() {
  const counts = countsOf(state.cases)
  return {
    webmcpPresent: state.webmcpPresent,
    toolCount: state.webmcpToolCount,
    classifiedAt: state.classifiedAt,
    fingerprint: state.specsFingerprint,
    parseError: state.parseError,
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
    })
  }
}
