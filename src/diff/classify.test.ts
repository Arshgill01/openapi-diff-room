import { describe, expect, it } from 'vitest'
import { classifyDocs } from './classify'
import { parseSpec } from './parse'
import { RULE_LIST } from './rules'
import { buildMigrationMarkdown } from './export'
import demoOld from '../fixtures/petstore-v1.yaml?raw'
import demoNew from '../fixtures/petstore-v2.yaml?raw'
import type { DiffCase } from '../types'

function spec(paths: unknown, schemas?: unknown): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: { title: 't', version: '1' },
    paths,
    ...(schemas ? { components: { schemas } } : {}),
  }
}

function ids(cases: DiffCase[]): string[] {
  return cases.map((c) => c.ruleId).sort()
}

function byRule(cases: DiffCase[], ruleId: string): DiffCase[] {
  return cases.filter((c) => c.ruleId === ruleId)
}

describe('rule table', () => {
  it('keeps an auditable 15–25 rule set', () => {
    expect(RULE_LIST.length).toBeGreaterThanOrEqual(15)
    expect(RULE_LIST.length).toBeLessThanOrEqual(25)
  })
})

describe('classifyDocs', () => {
  it('auto-settles docs-only description edits', () => {
    const oldDoc = spec({
      '/x': { get: { description: 'A', responses: { '200': { description: 'ok' } } } },
    })
    const newDoc = spec({
      '/x': { get: { description: 'B, still the same contract', responses: { '200': { description: 'ok' } } } },
    })
    const cases = classifyDocs(oldDoc, newDoc)
    expect(ids(cases)).toEqual(['docs-only'])
    expect(cases[0]?.status).toBe('auto-settled')
  })

  it('auto-settles property key reorder with the same schema', () => {
    const oldDoc = spec({}, {
      Box: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
    })
    const newDoc = spec({}, {
      Box: { type: 'object', properties: { b: { type: 'string' }, a: { type: 'string' } } },
    })
    const cases = classifyDocs(oldDoc, newDoc)
    expect(byRule(cases, 'property-reorder')).toHaveLength(1)
    expect(cases[0]?.status).toBe('auto-settled')
  })

  it('treats a new path as safe additive', () => {
    const oldDoc = spec({ '/x': { get: { responses: { '200': { description: 'ok' } } } } })
    const newDoc = spec({
      '/x': { get: { responses: { '200': { description: 'ok' } } } },
      '/y': { post: { responses: { '201': { description: 'created' } } } },
    })
    const added = byRule(classifyDocs(oldDoc, newDoc), 'endpoint-added')
    expect(added).toHaveLength(1)
    expect(added[0]?.status).toBe('safe-additive')
    expect(added[0]?.method).toBe('POST')
  })

  it('waits on a removed endpoint', () => {
    const oldDoc = spec({
      '/pets/{id}': { delete: { responses: { '204': { description: 'gone' } } } },
    })
    const newDoc = spec({})
    const cases = byRule(classifyDocs(oldDoc, newDoc), 'endpoint-removed')
    expect(cases).toHaveLength(1)
    expect(cases[0]?.status).toBe('waiting')
  })

  it('waits on a new required request property', () => {
    const oldDoc = spec({
      '/p': {
        post: {
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const newDoc = spec({
      '/p': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ownerId'],
                  properties: { name: { type: 'string' }, ownerId: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const cases = byRule(classifyDocs(oldDoc, newDoc), 'required-request-property-added')
    expect(cases.length).toBeGreaterThanOrEqual(1)
    expect(cases[0]?.status).toBe('waiting')
  })

  it('auto-settles an optional request property add', () => {
    const oldDoc = spec({
      '/p': {
        post: {
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const newDoc = spec({
      '/p': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { name: { type: 'string' }, nick: { type: 'string' } } },
              },
            },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const cases = byRule(classifyDocs(oldDoc, newDoc), 'optional-request-property-added')
    expect(cases).toHaveLength(1)
    expect(cases[0]?.status).toBe('safe-additive')
  })

  it('waits on type changes', () => {
    const oldDoc = spec({
      '/p': {
        get: {
          responses: {
            '200': { content: { 'application/json': { schema: { type: 'object', properties: { n: { type: 'string' } } } } } },
          },
        },
      },
    })
    const newDoc = spec({
      '/p': {
        get: {
          responses: {
            '200': { content: { 'application/json': { schema: { type: 'object', properties: { n: { type: 'integer' } } } } } },
          },
        },
      },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'type-changed')[0]?.status).toBe('waiting')
  })

  it('waits when an enum value is removed', () => {
    const oldDoc = spec({}, {
      Status: { type: 'string', enum: ['a', 'b', 'c'] },
    })
    const newDoc = spec({}, {
      Status: { type: 'string', enum: ['a', 'c'] },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'enum-value-removed')[0]?.status).toBe('waiting')
  })

  it('waits when a response property is removed', () => {
    const oldDoc = spec({
      '/p': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { id: { type: 'string' }, tag: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    })
    const newDoc = spec({
      '/p': {
        get: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { id: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'response-property-removed')[0]?.status).toBe('waiting')
  })

  it('waits on a new required parameter', () => {
    const oldDoc = spec({ '/p': { get: { responses: { '200': { description: 'ok' } } } } })
    const newDoc = spec({
      '/p': {
        get: {
          parameters: [{ name: 'shelterId', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'required-parameter-added')[0]?.status).toBe('waiting')
  })

  it('waits when format is narrowed', () => {
    const oldDoc = spec({
      '/p': {
        get: {
          parameters: [{ name: 'id', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const newDoc = spec({
      '/p': {
        get: {
          parameters: [{ name: 'id', in: 'query', schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'format-narrowed')[0]?.status).toBe('waiting')
  })

  it('waits on description contract language', () => {
    const oldDoc = spec({
      '/p': { get: { description: 'Fetch a pet.', responses: { '200': { description: 'ok' } } } },
    })
    const newDoc = spec({
      '/p': {
        get: {
          description: 'Clients MUST send an Idempotency-Key header.',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'description-contract-language')[0]?.status).toBe('waiting')
  })

  it('waits when nullable is removed', () => {
    const oldDoc = spec({
      '/p': {
        get: {
          responses: {
            '200': { content: { 'application/json': { schema: { type: 'string', nullable: true } } } },
          },
        },
      },
    })
    const newDoc = spec({
      '/p': {
        get: {
          responses: {
            '200': { content: { 'application/json': { schema: { type: 'string' } } } },
          },
        },
      },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'nullable-removed')[0]?.status).toBe('waiting')
  })

  it('waits when a numeric constraint is narrowed', () => {
    const oldDoc = spec({
      '/p': {
        get: {
          parameters: [{ name: 'n', in: 'query', schema: { type: 'integer', maximum: 100 } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const newDoc = spec({
      '/p': {
        get: {
          parameters: [{ name: 'n', in: 'query', schema: { type: 'integer', maximum: 10 } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    expect(byRule(classifyDocs(oldDoc, newDoc), 'constraint-narrowed')[0]?.status).toBe('waiting')
  })
})

describe('demo fixture mix', () => {
  it('shows both auto-settle and waiting on the Petstore pair', () => {
    const oldParsed = parseSpec(demoOld, 'Old')
    const newParsed = parseSpec(demoNew, 'New')
    expect(oldParsed.ok).toBe(true)
    expect(newParsed.ok).toBe(true)
    if (!oldParsed.ok || !newParsed.ok) return
    const cases = classifyDocs(oldParsed.doc, newParsed.doc)
    const rules = new Set(cases.map((c) => c.ruleId))
    expect(rules.has('docs-only') || rules.has('property-reorder')).toBe(true)
    expect(rules.has('endpoint-added')).toBe(true)
    expect(rules.has('optional-request-property-added')).toBe(true)
    expect(rules.has('endpoint-removed')).toBe(true)
    expect(rules.has('required-parameter-added')).toBe(true)
    expect(rules.has('enum-value-removed')).toBe(true)
    expect(rules.has('description-contract-language')).toBe(true)
    expect(cases.some((c) => c.status === 'waiting')).toBe(true)
    expect(cases.some((c) => c.status === 'auto-settled' || c.status === 'safe-additive')).toBe(true)
  })
})

describe('exportMigrationNotes', () => {
  it('refuses while waiting cards remain', () => {
    const result = buildMigrationMarkdown({
      oldTitle: 'old',
      newTitle: 'new',
      cases: [
        {
          id: '1',
          ruleId: 'endpoint-removed',
          method: 'DELETE',
          path: '/x',
          jsonPointer: '',
          why: 'removed',
          oldSnippet: 'x',
          newSnippet: '∅',
          status: 'waiting',
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/export_refused/)
      expect(result.waitingIds).toEqual(['1'])
    }
  })

  it('exports after a human ack', () => {
    const result = buildMigrationMarkdown({
      oldTitle: 'old',
      newTitle: 'new',
      cases: [
        {
          id: '1',
          ruleId: 'endpoint-removed',
          method: 'DELETE',
          path: '/x',
          jsonPointer: '',
          why: 'removed',
          oldSnippet: 'x',
          newSnippet: '∅',
          status: 'acked-intentional',
          decidedBy: 'human',
        },
        {
          id: '2',
          ruleId: 'docs-only',
          method: 'GET',
          path: '/x',
          jsonPointer: '/description',
          why: 'docs',
          oldSnippet: 'a',
          newSnippet: 'b',
          status: 'auto-settled',
          decidedBy: 'classifier',
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.markdown).toMatch(/intentional breaking change/)
      expect(result.markdown).toMatch(/docs-only/)
    }
  })
})
