import type { DiffCase } from '../types'
import { isInjectionText, stripVendorExtensions } from './injection'
import { getRule } from './rules'
import {
  deepEqual,
  deref,
  isPlainObject,
  pickDocs,
  snippet,
  structuralEqual,
} from './normalize'

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

const CONTRACT_RE =
  /\b(MUST NOT|SHALL NOT|MUST|SHALL|REQUIRED|FORBIDDEN|breaking change|do not omit|idempotency-key)\b/i

type Ctx = {
  method: string
  path: string
  pointer: string
  location: 'request' | 'response' | 'parameter' | 'schema'
  rootOld: unknown
  rootNew: unknown
}

function makeCase(
  ruleId: string,
  ctx: Pick<Ctx, 'method' | 'path' | 'pointer'>,
  oldVal: unknown,
  newVal: unknown,
  extraWhy?: string,
): DiffCase {
  const rule = getRule(ruleId)
  const status =
    rule.action === 'wait' ? 'waiting' : rule.bucket === 'safe' ? 'safe-additive' : 'auto-settled'
  return {
    id: `${ruleId}:${ctx.method}:${ctx.path}:${ctx.pointer}`,
    ruleId,
    method: ctx.method,
    path: ctx.path,
    jsonPointer: ctx.pointer,
    why: extraWhy ?? rule.why,
    oldSnippet: snippet(oldVal),
    newSnippet: snippet(newVal),
    status,
    decidedBy: rule.action === 'wait' ? undefined : 'classifier',
  }
}

function sameRef(a: unknown, b: unknown): boolean {
  if (!isPlainObject(a) || !isPlainObject(b)) return false
  return typeof a.$ref === 'string' && a.$ref === b.$ref
}

function typesOf(schema: Record<string, unknown>): string[] {
  const t = schema.type
  if (Array.isArray(t)) {
    return t.filter((x): x is string => typeof x === 'string' && x !== 'null').sort()
  }
  if (typeof t === 'string' && t !== 'null') return [t]
  return []
}

function isNullable(schema: Record<string, unknown>): boolean {
  if (schema.nullable === true) return true
  const t = schema.type
  if (Array.isArray(t) && t.includes('null')) return true
  return false
}

function asSchema(node: unknown, root: unknown): Record<string, unknown> | undefined {
  const resolved = deref(node, root)
  return isPlainObject(resolved) ? resolved : undefined
}

function paramKey(param: Record<string, unknown>): string {
  return `${String(param.in ?? '')}:${String(param.name ?? '')}`
}

function mergeParameters(
  pathItem: Record<string, unknown> | undefined,
  operation: Record<string, unknown> | undefined,
  root: unknown,
): Record<string, unknown>[] {
  const raw = [
    ...(Array.isArray(pathItem?.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation?.parameters) ? operation.parameters : []),
  ]
  const map = new Map<string, Record<string, unknown>>()
  for (const item of raw) {
    const resolved = asSchema(item, root) ?? (isPlainObject(item) ? item : undefined)
    if (!resolved) continue
    map.set(paramKey(resolved), resolved)
  }
  return [...map.values()]
}

function listOperations(
  doc: Record<string, unknown>,
): Map<string, { path: string; method: string; operation: Record<string, unknown>; pathItem: Record<string, unknown> }> {
  const map = new Map<
    string,
    { path: string; method: string; operation: Record<string, unknown>; pathItem: Record<string, unknown> }
  >()
  const paths = isPlainObject(doc.paths) ? doc.paths : {}
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isPlainObject(pathItem)) continue
    for (const method of METHODS) {
      const operation = pathItem[method]
      if (isPlainObject(operation)) {
        map.set(`${method.toUpperCase()} ${path}`, {
          path,
          method: method.toUpperCase(),
          operation,
          pathItem,
        })
      }
    }
  }
  return map
}

function schemaNames(doc: Record<string, unknown>): string[] {
  const components = isPlainObject(doc.components) ? doc.components : undefined
  const schemas = isPlainObject(components?.schemas) ? components.schemas : {}
  return Object.keys(schemas)
}

function hasContractLanguage(value: unknown): boolean {
  if (typeof value === 'string') {
    if (isInjectionText(value)) return false
    return CONTRACT_RE.test(value)
  }
  if (isPlainObject(value)) {
    return ['description', 'summary', 'title'].some((key) => hasContractLanguage(value[key]))
  }
  return false
}

function docsChangedWithContract(oldVal: unknown, newVal: unknown): boolean {
  const oldDocs = pickDocs(oldVal)
  const newDocs = pickDocs(newVal)
  if (deepEqual(oldDocs, newDocs)) return false
  return hasContractLanguage(oldDocs) || hasContractLanguage(newDocs)
}

function propertyKeys(schema: Record<string, unknown> | undefined): string[] {
  if (!schema || !isPlainObject(schema.properties)) return []
  return Object.keys(schema.properties)
}

function compareSchema(oldNode: unknown, newNode: unknown, ctx: Ctx): DiffCase[] {
  const cases: DiffCase[] = []
  if (oldNode === undefined && newNode === undefined) return cases
  if (sameRef(oldNode, newNode) && ctx.location !== 'schema') {
    return cases
  }

  const oldS = asSchema(oldNode, ctx.rootOld)
  const newS = asSchema(newNode, ctx.rootNew)

  if (!oldS && newS) return cases
  if (oldS && !newS) {
    const ruleId = ctx.location === 'response' ? 'response-property-removed' : 'request-property-removed'
    cases.push(makeCase(ruleId, ctx, oldNode, newNode))
    return cases
  }
  if (!oldS || !newS) return cases

  if (structuralEqual(oldS, newS)) {
    if (docsChangedWithContract(oldS, newS)) {
      cases.push(makeCase('description-contract-language', ctx, pickDocs(oldS), pickDocs(newS)))
    } else if (!deepEqual(pickDocs(oldS), pickDocs(newS))) {
      cases.push(makeCase('docs-only', ctx, pickDocs(oldS), pickDocs(newS)))
    }
    const oKeys = propertyKeys(oldS)
    const nKeys = propertyKeys(newS)
    if (
      oKeys.length > 1 &&
      oKeys.length === nKeys.length &&
      [...oKeys].sort().join('\0') === [...nKeys].sort().join('\0') &&
      oKeys.join('\0') !== nKeys.join('\0')
    ) {
      cases.push(makeCase('property-reorder', ctx, oKeys, nKeys))
    }
    for (const key of oKeys) {
      const propsO = oldS.properties as Record<string, unknown>
      const propsN = newS.properties as Record<string, unknown>
      cases.push(
        ...compareSchema(propsO[key], propsN[key], {
          ...ctx,
          pointer: `${ctx.pointer}/properties/${key}`,
        }),
      )
    }
    return cases
  }

  const oldTypes = typesOf(oldS)
  const newTypes = typesOf(newS)
  if (oldTypes.length && newTypes.length && oldTypes.join(',') !== newTypes.join(',')) {
    cases.push(makeCase('type-changed', ctx, oldTypes, newTypes))
  }

  const oldFormat = typeof oldS.format === 'string' ? oldS.format : undefined
  const newFormat = typeof newS.format === 'string' ? newS.format : undefined
  if (newFormat && newFormat !== oldFormat) {
    cases.push(makeCase('format-narrowed', ctx, oldFormat ?? '∅', newFormat))
  }

  if (isNullable(oldS) && !isNullable(newS)) {
    cases.push(makeCase('nullable-removed', ctx, { nullable: true }, { nullable: false }))
  }

  const oldEnum = Array.isArray(oldS.enum) ? oldS.enum : []
  const newEnum = Array.isArray(newS.enum) ? newS.enum : []
  if (oldEnum.length || newEnum.length) {
    const removed = oldEnum.filter((v) => !newEnum.some((n) => deepEqual(n, v)))
    if (removed.length) {
      cases.push(makeCase('enum-value-removed', ctx, oldEnum, newEnum))
    }
  }

  if (constraintNarrowed(oldS, newS)) {
    cases.push(
      makeCase('constraint-narrowed', ctx, pickConstraints(oldS), pickConstraints(newS)),
    )
  }

  if (oldS.additionalProperties !== false && newS.additionalProperties === false) {
    cases.push(
      makeCase(
        'additional-properties-disallowed',
        ctx,
        oldS.additionalProperties ?? true,
        false,
      ),
    )
  }

  const oldProps = isPlainObject(oldS.properties) ? oldS.properties : {}
  const newProps = isPlainObject(newS.properties) ? newS.properties : {}
  const oldReq = new Set(
    Array.isArray(oldS.required) ? oldS.required.filter((x): x is string => typeof x === 'string') : [],
  )
  const newReq = new Set(
    Array.isArray(newS.required) ? newS.required.filter((x): x is string => typeof x === 'string') : [],
  )
  const keys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)])

  for (const key of keys) {
    const child: Ctx = { ...ctx, pointer: `${ctx.pointer}/properties/${key}` }
    const had = key in oldProps
    const has = key in newProps
    if (!had && has) {
      if (newReq.has(key) && ctx.location === 'request') {
        cases.push(makeCase('required-request-property-added', child, undefined, newProps[key]))
      } else if (ctx.location === 'response') {
        cases.push(makeCase('optional-response-property-added', child, undefined, newProps[key]))
      } else {
        cases.push(makeCase('optional-request-property-added', child, undefined, newProps[key]))
      }
      continue
    }
    if (had && !has) {
      const ruleId = ctx.location === 'response' ? 'response-property-removed' : 'request-property-removed'
      cases.push(makeCase(ruleId, child, oldProps[key], undefined))
      continue
    }
    if (!oldReq.has(key) && newReq.has(key) && ctx.location === 'request') {
      cases.push(makeCase('required-request-property-added', child, { required: false }, { required: true }))
    }
    cases.push(...compareSchema(oldProps[key], newProps[key], child))
  }

  if (oldS.items !== undefined || newS.items !== undefined) {
    cases.push(
      ...compareSchema(oldS.items, newS.items, { ...ctx, pointer: `${ctx.pointer}/items` }),
    )
  }

  if (isPlainObject(oldS.additionalProperties) || isPlainObject(newS.additionalProperties)) {
    cases.push(
      ...compareSchema(oldS.additionalProperties, newS.additionalProperties, {
        ...ctx,
        pointer: `${ctx.pointer}/additionalProperties`,
      }),
    )
  }

  for (const combiner of ['allOf', 'oneOf', 'anyOf'] as const) {
    const oldArr = Array.isArray(oldS[combiner]) ? oldS[combiner] : []
    const newArr = Array.isArray(newS[combiner]) ? newS[combiner] : []
    const len = Math.max(oldArr.length, newArr.length)
    for (let i = 0; i < len; i += 1) {
      cases.push(
        ...compareSchema(oldArr[i], newArr[i], {
          ...ctx,
          pointer: `${ctx.pointer}/${combiner}/${i}`,
        }),
      )
    }
  }

  return cases
}

function pickConstraints(schema: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'pattern',
    'multipleOf',
  ]
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in schema) out[key] = schema[key]
  }
  return out
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function constraintNarrowed(oldS: Record<string, unknown>, newS: Record<string, unknown>): boolean {
  const omin = num(oldS.minimum)
  const nmin = num(newS.minimum)
  if (nmin !== undefined && (omin === undefined || nmin > omin)) return true

  const omax = num(oldS.maximum)
  const nmax = num(newS.maximum)
  if (nmax !== undefined && (omax === undefined || nmax < omax)) return true

  const ominl = num(oldS.minLength)
  const nminl = num(newS.minLength)
  if (nminl !== undefined && (ominl === undefined || nminl > ominl)) return true

  const omaxl = num(oldS.maxLength)
  const nmaxl = num(newS.maxLength)
  if (nmaxl !== undefined && (omaxl === undefined || nmaxl < omaxl)) return true

  const omini = num(oldS.minItems)
  const nmini = num(newS.minItems)
  if (nmini !== undefined && (omini === undefined || nmini > omini)) return true

  const omaxi = num(oldS.maxItems)
  const nmaxi = num(newS.maxItems)
  if (nmaxi !== undefined && (omaxi === undefined || nmaxi < omaxi)) return true

  if (typeof newS.pattern === 'string' && newS.pattern !== oldS.pattern) return true

  const omult = num(oldS.multipleOf)
  const nmult = num(newS.multipleOf)
  if (nmult !== undefined && omult !== undefined && nmult > omult) return true
  if (nmult !== undefined && omult === undefined) return true

  return false
}

function compareMedia(
  oldContent: unknown,
  newContent: unknown,
  ctx: Ctx,
): DiffCase[] {
  const cases: DiffCase[] = []
  const oldMap = isPlainObject(oldContent) ? oldContent : {}
  const newMap = isPlainObject(newContent) ? newContent : {}
  const types = new Set([...Object.keys(oldMap), ...Object.keys(newMap)])
  for (const mt of types) {
    const child: Ctx = { ...ctx, pointer: `${ctx.pointer}/${mt}` }
    if (mt in oldMap && !(mt in newMap)) {
      cases.push(makeCase('media-type-removed', child, mt, undefined))
      continue
    }
    if (!(mt in oldMap) && mt in newMap) {
      continue
    }
    const oldMt = isPlainObject(oldMap[mt]) ? oldMap[mt] : {}
    const newMt = isPlainObject(newMap[mt]) ? newMap[mt] : {}
    cases.push(
      ...compareSchema(oldMt.schema, newMt.schema, { ...child, pointer: `${child.pointer}/schema` }),
    )
    if (
      structuralEqual({ schema: oldMt.schema }, { schema: newMt.schema }) &&
      docsChangedWithContract(oldMt, newMt)
    ) {
      cases.push(makeCase('description-contract-language', child, pickDocs(oldMt), pickDocs(newMt)))
    } else if (
      structuralEqual({ schema: oldMt.schema }, { schema: newMt.schema }) &&
      !deepEqual(pickDocs(oldMt), pickDocs(newMt))
    ) {
      cases.push(makeCase('docs-only', child, pickDocs(oldMt), pickDocs(newMt)))
    }
  }
  return cases
}

function compareParameters(
  oldParams: Record<string, unknown>[],
  newParams: Record<string, unknown>[],
  ctx: Omit<Ctx, 'pointer' | 'location'>,
): DiffCase[] {
  const cases: DiffCase[] = []
  const oldMap = new Map(oldParams.map((p) => [paramKey(p), p]))
  const newMap = new Map(newParams.map((p) => [paramKey(p), p]))
  const keys = new Set([...oldMap.keys(), ...newMap.keys()])
  for (const key of keys) {
    const oldP = oldMap.get(key)
    const newP = newMap.get(key)
    const pointer = `/parameters/${key}`
    const child: Ctx = { ...ctx, pointer, location: 'parameter' }
    if (oldP && !newP) {
      cases.push(makeCase('request-parameter-removed', child, oldP, undefined))
      continue
    }
    if (!oldP && newP) {
      if (newP.required === true) {
        cases.push(makeCase('required-parameter-added', child, undefined, newP))
      } else {
        cases.push(makeCase('optional-parameter-added', child, undefined, newP))
      }
      continue
    }
    if (!oldP || !newP) continue
    if (oldP.required !== true && newP.required === true) {
      cases.push(makeCase('parameter-became-required', child, { required: false }, { required: true }))
    }
    cases.push(
      ...compareSchema(oldP.schema, newP.schema, {
        ...child,
        location: 'request',
        pointer: `${pointer}/schema`,
      }),
    )
    if (structuralEqual(oldP.schema, newP.schema) && oldP.required === newP.required) {
      if (docsChangedWithContract(oldP, newP)) {
        cases.push(makeCase('description-contract-language', child, pickDocs(oldP), pickDocs(newP)))
      } else if (!deepEqual(pickDocs(oldP), pickDocs(newP))) {
        cases.push(makeCase('docs-only', child, pickDocs(oldP), pickDocs(newP)))
      }
    }
  }
  return cases
}

function compareRequestBody(
  oldBody: unknown,
  newBody: unknown,
  ctx: Omit<Ctx, 'pointer' | 'location'>,
): DiffCase[] {
  const cases: DiffCase[] = []
  const pointer = '/requestBody'
  const child: Ctx = { ...ctx, pointer, location: 'request' }
  const oldB = asSchema(oldBody, ctx.rootOld)
  const newB = asSchema(newBody, ctx.rootNew)
  if (!oldB && newB) {
    if (newB.required === true) {
      cases.push(makeCase('request-body-became-required', child, undefined, { required: true }))
    } else {
      cases.push(makeCase('optional-request-property-added', child, undefined, { required: false }))
    }
    cases.push(...compareMedia(undefined, newB.content, { ...child, pointer: `${pointer}/content` }))
    return cases
  }
  if (oldB && !newB) {
    cases.push(makeCase('request-property-removed', child, oldB, undefined))
    return cases
  }
  if (!oldB || !newB) return cases
  if (oldB.required !== true && newB.required === true) {
    cases.push(makeCase('request-body-became-required', child, { required: oldB.required ?? false }, { required: true }))
  }
  cases.push(...compareMedia(oldB.content, newB.content, { ...child, pointer: `${pointer}/content` }))
  return cases
}

function compareResponses(
  oldRes: unknown,
  newRes: unknown,
  ctx: Omit<Ctx, 'pointer' | 'location'>,
): DiffCase[] {
  const cases: DiffCase[] = []
  const oldMap = isPlainObject(oldRes) ? oldRes : {}
  const newMap = isPlainObject(newRes) ? newRes : {}
  const codes = new Set([...Object.keys(oldMap), ...Object.keys(newMap)])
  for (const code of codes) {
    const pointer = `/responses/${code}`
    const child: Ctx = { ...ctx, pointer, location: 'response' }
    const oldR = asSchema(oldMap[code], ctx.rootOld)
    const newR = asSchema(newMap[code], ctx.rootNew)
    if (oldR && !newR) {
      cases.push(makeCase('response-status-removed', child, code, undefined))
      continue
    }
    if (!oldR && newR) {
      cases.push(makeCase('response-status-added', child, undefined, code))
      continue
    }
    if (!oldR || !newR) continue
    if (docsChangedWithContract(oldR, newR) && structuralEqual(oldR.content, newR.content)) {
      cases.push(makeCase('description-contract-language', child, pickDocs(oldR), pickDocs(newR)))
    } else if (!deepEqual(pickDocs(oldR), pickDocs(newR)) && structuralEqual(oldR.content, newR.content)) {
      cases.push(makeCase('docs-only', child, pickDocs(oldR), pickDocs(newR)))
    }
    cases.push(...compareMedia(oldR.content, newR.content, { ...child, pointer: `${pointer}/content` }))
  }
  return cases
}

function securityKeys(security: unknown): string[] {
  if (!Array.isArray(security)) return []
  const keys: string[] = []
  for (const item of security) {
    if (!isPlainObject(item)) continue
    keys.push(...Object.keys(item).sort())
  }
  return [...new Set(keys)].sort()
}

function compareSecurity(
  oldOp: Record<string, unknown>,
  newOp: Record<string, unknown>,
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
  ctx: Omit<Ctx, 'pointer' | 'location'>,
): DiffCase[] {
  const oldSec = oldOp.security !== undefined ? oldOp.security : oldDoc.security
  const newSec = newOp.security !== undefined ? newOp.security : newDoc.security
  const oldKeys = securityKeys(oldSec)
  const newKeys = securityKeys(newSec)
  const added = newKeys.filter((k) => !oldKeys.includes(k))
  if (added.length && newKeys.length > oldKeys.length) {
    return [
      makeCase('security-requirement-added', { ...ctx, pointer: '/security' }, oldKeys, newKeys),
    ]
  }
  if (oldKeys.length === 0 && newKeys.length > 0) {
    return [
      makeCase('security-requirement-added', { ...ctx, pointer: '/security' }, oldKeys, newKeys),
    ]
  }
  return []
}

function compareOperation(
  oldOp: Record<string, unknown>,
  newOp: Record<string, unknown>,
  oldPathItem: Record<string, unknown> | undefined,
  newPathItem: Record<string, unknown> | undefined,
  ctx: Omit<Ctx, 'pointer' | 'location'>,
): DiffCase[] {
  const cases: DiffCase[] = []
  const oldParams = mergeParameters(oldPathItem, oldOp, ctx.rootOld)
  const newParams = mergeParameters(newPathItem, newOp, ctx.rootNew)
  cases.push(...compareParameters(oldParams, newParams, ctx))
  cases.push(...compareRequestBody(oldOp.requestBody, newOp.requestBody, ctx))
  cases.push(...compareResponses(oldOp.responses, newOp.responses, ctx))
  cases.push(
    ...compareSecurity(
      oldOp,
      newOp,
      ctx.rootOld as Record<string, unknown>,
      ctx.rootNew as Record<string, unknown>,
      ctx,
    ),
  )

  const opDocsOld = { description: oldOp.description, summary: oldOp.summary, externalDocs: oldOp.externalDocs }
  const opDocsNew = { description: newOp.description, summary: newOp.summary, externalDocs: newOp.externalDocs }
  const structuralOpOld = {
    parameters: oldOp.parameters,
    requestBody: oldOp.requestBody,
    responses: oldOp.responses,
    security: oldOp.security,
  }
  const structuralOpNew = {
    parameters: newOp.parameters,
    requestBody: newOp.requestBody,
    responses: newOp.responses,
    security: newOp.security,
  }
  if (structuralEqual(structuralOpOld, structuralOpNew)) {
    if (docsChangedWithContract(opDocsOld, opDocsNew)) {
      cases.push(
        makeCase(
          'description-contract-language',
          { ...ctx, pointer: '/description' },
          opDocsOld,
          opDocsNew,
        ),
      )
    } else if (!deepEqual(opDocsOld, opDocsNew)) {
      cases.push(makeCase('docs-only', { ...ctx, pointer: '/description' }, opDocsOld, opDocsNew))
    }
  } else if (docsChangedWithContract(opDocsOld, opDocsNew)) {
    cases.push(
      makeCase(
        'description-contract-language',
        { ...ctx, pointer: '/description' },
        opDocsOld,
        opDocsNew,
      ),
    )
  }

  return cases
}

function dedupe(cases: DiffCase[]): DiffCase[] {
  const map = new Map<string, DiffCase>()
  for (const item of cases) {
    if (!map.has(item.id)) map.set(item.id, item)
  }
  return [...map.values()]
}

export function classifyDocs(
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
): DiffCase[] {
  const oldClean = stripVendorExtensions(oldDoc) as Record<string, unknown>
  const newClean = stripVendorExtensions(newDoc) as Record<string, unknown>
  const cases: DiffCase[] = []
  const oldOps = listOperations(oldClean)
  const newOps = listOperations(newClean)
  const keys = new Set([...oldOps.keys(), ...newOps.keys()])

  for (const key of keys) {
    const oldOp = oldOps.get(key)
    const newOp = newOps.get(key)
    if (oldOp && !newOp) {
      cases.push(
        makeCase('endpoint-removed', { method: oldOp.method, path: oldOp.path, pointer: '' }, key, undefined),
      )
      continue
    }
    if (!oldOp && newOp) {
      cases.push(
        makeCase('endpoint-added', { method: newOp.method, path: newOp.path, pointer: '' }, undefined, key),
      )
      continue
    }
    if (!oldOp || !newOp) continue
    cases.push(
      ...compareOperation(oldOp.operation, newOp.operation, oldOp.pathItem, newOp.pathItem, {
        method: oldOp.method,
        path: oldOp.path,
        rootOld: oldClean,
        rootNew: newClean,
      }),
    )
  }

  const names = new Set([...schemaNames(oldClean), ...schemaNames(newClean)])
  const oldSchemas = isPlainObject((oldClean.components as Record<string, unknown> | undefined)?.schemas)
    ? ((oldClean.components as Record<string, unknown>).schemas as Record<string, unknown>)
    : {}
  const newSchemas = isPlainObject((newClean.components as Record<string, unknown> | undefined)?.schemas)
    ? ((newClean.components as Record<string, unknown>).schemas as Record<string, unknown>)
    : {}

  for (const name of names) {
    if (!(name in oldSchemas) || !(name in newSchemas)) continue
    const location: Ctx['location'] = inferSchemaLocation(name, oldClean, newClean)
    cases.push(
      ...compareSchema(oldSchemas[name], newSchemas[name], {
        method: 'SCHEMA',
        path: `#/components/schemas/${name}`,
        pointer: `#/components/schemas/${name}`,
        location,
        rootOld: oldClean,
        rootNew: newClean,
      }),
    )
  }

  return dedupe(cases)
}

function inferSchemaLocation(
  name: string,
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
): Ctx['location'] {
  const blob = JSON.stringify({ oldDoc, newDoc })
  const requestHit = blob.includes(`"requestBody"`) && blob.includes(`#/components/schemas/${name}`)
  const responseHit = blob.includes(`"responses"`) && blob.includes(`#/components/schemas/${name}`)
  if (requestHit && !responseHit) return 'request'
  if (responseHit && !requestHit) return 'response'
  if (name.toLowerCase().startsWith('new') || name.toLowerCase().includes('request')) return 'request'
  return 'response'
}

export function sortCases(cases: DiffCase[]): DiffCase[] {
  const rank: Record<string, number> = {
    waiting: 0,
    'safe-additive': 1,
    'auto-settled': 2,
    'acked-intentional': 3,
    'acked-new': 4,
    'acked-old': 5,
  }
  return [...cases].sort((a, b) => {
    const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    if (r !== 0) return r
    return a.id.localeCompare(b.id)
  })
}
