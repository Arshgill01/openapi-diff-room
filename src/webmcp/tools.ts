import { utf8Bytes } from '../diff/normalize'
import { SPEC_BYTE_CAP } from '../diff/parse'
import {
  classifyDiff,
  exportNotes,
  focusCase,
  getRoomState,
  listRoomPayload,
  loadDemoPair,
  setSpecs,
} from '../room/store'
import { mcpJson } from './types'
import type { WebMcpTool } from './types'

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export const ROOM_TOOLS: WebMcpTool[] = [
  {
    name: 'get_room_state',
    description:
      'Snapshot of OpenAPI Diff Room: settled/waiting/safe counts, case ids and statuses, and whether WebMCP is present. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const room = listRoomPayload()
      const state = getRoomState()
      return mcpJson({
        webmcpPresent: room.webmcpPresent,
        toolCount: room.toolCount,
        counts: room.counts,
        classifiedAt: room.classifiedAt,
        parseError: state.parseError,
        cases: room.cases.map((c) => ({ id: c.id, status: c.status, ruleId: c.ruleId })),
      })
    },
  },
  {
    name: 'set_specs',
    description:
      'Load the built-in Petstore demo pair (fixture=demo) or replace both OpenAPI 3.x specs with YAML/JSON strings (max 200KB each). Clears the room and reclassifies. Does not settle waiting cards.',
    inputSchema: {
      type: 'object',
      properties: {
        fixture: {
          type: 'string',
          enum: ['demo'],
          description: 'Built-in Petstore v1 vs v2 pair with mechanical noise and breaking changes.',
        },
        old: {
          type: 'string',
          description: 'Old OpenAPI 3.x document as YAML or JSON.',
        },
        new: {
          type: 'string',
          description: 'New OpenAPI 3.x document as YAML or JSON.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (args) => {
      if (args.fixture === 'demo') {
        return mcpJson({ action: 'load_fixture', ...loadDemoPair('tool: set_specs fixture=demo') })
      }
      const old = str(args.old)
      const neu = str(args.new)
      if (!old || !neu) {
        return mcpJson({
          error: 'Provide fixture="demo" or both old and new OpenAPI strings.',
        })
      }
      if (utf8Bytes(old) > SPEC_BYTE_CAP || utf8Bytes(neu) > SPEC_BYTE_CAP) {
        return mcpJson({ error: 'Each spec must be ≤ 200KB.' })
      }
      return mcpJson({ action: 'set_specs', ...setSpecs(old, neu, 'tool: set_specs') })
    },
  },
  {
    name: 'classify_diff',
    description:
      'Run the mechanical/breaking classifier on the specs currently in the page. Fills the room. Idempotent if the specs are unchanged. Cannot settle waiting cards.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async () => mcpJson(classifyDiff('tool: classify_diff')),
  },
  {
    name: 'focus_case',
    description:
      'Highlight a diff case in the room UI by case id or by path + HTTP method. Returns old vs new snippets and the rule. Read-only; does not settle anything.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: { type: 'string', description: 'Stable case id from list_room.' },
        path: { type: 'string', description: 'OpenAPI path, for example /pets/{petId}.' },
        method: { type: 'string', description: 'HTTP method, for example DELETE.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (args) => {
      const result = focusCase(
        { caseId: str(args.caseId), path: str(args.path), method: str(args.method) },
        'tool: focus_case',
      )
      if (!result.ok) return mcpJson(result)
      const c = result.case
      return mcpJson({
        id: c.id,
        ruleId: c.ruleId,
        status: c.status,
        method: c.method,
        path: c.path,
        why: c.why,
        oldSnippet: c.oldSnippet,
        newSnippet: c.newSnippet,
      })
    },
  },
  {
    name: 'list_room',
    description:
      'Full room listing so an agent can poll after the human decides. Includes waiting, auto-settled, safe additive, and human-acked cards. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => mcpJson(listRoomPayload()),
  },
  {
    name: 'export_migration_notes',
    description:
      'Export Markdown migration notes from auto-settled + human-acked cases only. REFUSES if any waiting cards are still open. Agents cannot approve breaking changes.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => mcpJson(exportNotes('tool: export_migration_notes')),
  },
]
