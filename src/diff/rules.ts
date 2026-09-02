import type { Rule } from '../types'

/**
 * Auditable classifier rule table.
 * Inspired by oasdiff / Redline breaking-change check names — not a parity claim.
 * Mechanical rules auto-settle. Breaking and ambiguous rules wait on a human.
 */
export const RULES: Record<string, Rule> = {
  'docs-only': {
    id: 'docs-only',
    title: 'Documentation-only edit',
    action: 'auto-settle',
    bucket: 'settled',
    severity: 'info',
    why: 'Only description, summary, example, title, or docs fields changed. No schema or operation contract shift.',
  },
  'property-reorder': {
    id: 'property-reorder',
    title: 'Property key reorder',
    action: 'auto-settle',
    bucket: 'settled',
    severity: 'info',
    why: 'Object property keys were reordered; the schema is otherwise identical after JSON/$ref normalize.',
  },
  'endpoint-added': {
    id: 'endpoint-added',
    title: 'Endpoint added',
    action: 'auto-settle',
    bucket: 'safe',
    severity: 'additive',
    why: 'A new path or operation appeared. Additive for existing clients.',
  },
  'optional-request-property-added': {
    id: 'optional-request-property-added',
    title: 'Optional request field added',
    action: 'auto-settle',
    bucket: 'safe',
    severity: 'additive',
    why: 'An optional request body field (or optional request body) was added. Existing clients may omit it.',
  },
  'optional-response-property-added': {
    id: 'optional-response-property-added',
    title: 'Optional response field added',
    action: 'auto-settle',
    bucket: 'safe',
    severity: 'additive',
    why: 'A response field was added. Existing clients can ignore unknown properties.',
  },
  'optional-parameter-added': {
    id: 'optional-parameter-added',
    title: 'Optional parameter added',
    action: 'auto-settle',
    bucket: 'safe',
    severity: 'additive',
    why: 'An optional query, header, or cookie parameter was added.',
  },
  'response-status-added': {
    id: 'response-status-added',
    title: 'Response status added',
    action: 'auto-settle',
    bucket: 'safe',
    severity: 'additive',
    why: 'A new HTTP status was documented on an existing operation.',
  },
  'endpoint-removed': {
    id: 'endpoint-removed',
    title: 'Endpoint removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A path or HTTP method was removed. Clients that still call it will fail.',
  },
  'required-request-property-added': {
    id: 'required-request-property-added',
    title: 'Required request field added',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A new required request-body property will reject existing payloads that omit it.',
  },
  'required-parameter-added': {
    id: 'required-parameter-added',
    title: 'Required parameter added',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A new required parameter was added. Existing callers do not send it.',
  },
  'request-parameter-removed': {
    id: 'request-parameter-removed',
    title: 'Parameter removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A request parameter disappeared. Clients may still send it, or may depend on it.',
  },
  'request-property-removed': {
    id: 'request-property-removed',
    title: 'Request field removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A request-body property was removed. Existing clients may still send it.',
  },
  'response-property-removed': {
    id: 'response-property-removed',
    title: 'Response field removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A response property was removed. Clients that read it will break.',
  },
  'type-changed': {
    id: 'type-changed',
    title: 'Type changed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A schema type changed. Serialization and validation contracts shift.',
  },
  'format-narrowed': {
    id: 'format-narrowed',
    title: 'Format narrowed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A format was added or replaced with a stricter one (for example string → uuid).',
  },
  'enum-value-removed': {
    id: 'enum-value-removed',
    title: 'Enum value removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'An enum value disappeared. Existing payloads or responses using it are no longer valid.',
  },
  'response-status-removed': {
    id: 'response-status-removed',
    title: 'Response status removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A documented HTTP status was removed from the operation.',
  },
  'media-type-removed': {
    id: 'media-type-removed',
    title: 'Media type removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'A request or response media type was removed.',
  },
  'nullable-removed': {
    id: 'nullable-removed',
    title: 'Nullable removed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'null is no longer allowed. Clients that send or expect null will fail validation.',
  },
  'constraint-narrowed': {
    id: 'constraint-narrowed',
    title: 'Constraint narrowed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'minimum/minLength increased, maximum/maxLength decreased, or pattern tightened.',
  },
  'request-body-became-required': {
    id: 'request-body-became-required',
    title: 'Request body became required',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'The operation now requires a request body that was optional or absent.',
  },
  'parameter-became-required': {
    id: 'parameter-became-required',
    title: 'Parameter became required',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'An existing parameter flipped from optional to required.',
  },
  'description-contract-language': {
    id: 'description-contract-language',
    title: 'Description looks like a contract change',
    action: 'wait',
    bucket: 'waiting',
    severity: 'ambiguous',
    why: 'Docs changed and now use MUST/SHALL/REQUIRED (or similar). That may be a hidden contract. A human should read it.',
  },
  'security-requirement-added': {
    id: 'security-requirement-added',
    title: 'Security requirement added',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'The operation now requires authentication that existing anonymous clients do not send.',
  },
  'additional-properties-disallowed': {
    id: 'additional-properties-disallowed',
    title: 'additionalProperties disallowed',
    action: 'wait',
    bucket: 'waiting',
    severity: 'breaking',
    why: 'additionalProperties became false. Extra fields that used to pass will now fail.',
  },
}

export const RULE_LIST: Rule[] = Object.values(RULES)

export function getRule(id: string): Rule {
  const rule = RULES[id]
  if (!rule) {
    throw new Error(`Unknown classifier rule: ${id}`)
  }
  return rule
}
