const DOC_KEYS = new Set([
  'description',
  'summary',
  'example',
  'examples',
  'title',
  'externalDocs',
  'xml',
  'deprecated',
])

export function getByPointer(root: unknown, pointer: string): unknown {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return undefined
  const parts = pointer
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur: unknown = root
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export function deref(node: unknown, root: unknown, depth = 0): unknown {
  if (!node || typeof node !== 'object' || depth > 24) return node
  const ref = (node as { $ref?: unknown }).$ref
  if (typeof ref === 'string' && ref.startsWith('#/')) {
    const target = getByPointer(root, ref)
    if (target === undefined) return node
    return deref(target, root, depth + 1)
  }
  return node
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(normalize)
    const allScalar = mapped.every((item) => item === null || typeof item !== 'object')
    if (allScalar) {
      return [...mapped].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }
    return mapped
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      if (DOC_KEYS.has(key) || key === '$ref') {
        if (key === '$ref') out[key] = value[key]
        continue
      }
      out[key] = normalize(value[key])
    }
    return out
  }
  return value
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function structuralEqual(a: unknown, b: unknown): boolean {
  return deepEqual(normalize(a), normalize(b))
}

export function pickDocs(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) return undefined
  const out: Record<string, unknown> = {}
  for (const key of DOC_KEYS) {
    if (key in value) out[key] = value[key]
  }
  return Object.keys(out).length ? out : undefined
}

export function snippet(value: unknown, max = 900): string {
  if (value === undefined) return '∅'
  try {
    const text = JSON.stringify(value, null, 2) ?? String(value)
    if (text.length <= max) return text
    return `${text.slice(0, max)}\n…`
  } catch {
    return String(value)
  }
}

export function fingerprint(oldText: string, newText: string): string {
  const s = `${oldText}\n---\n${newText}`
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${s.length.toString(16)}:${(h >>> 0).toString(16)}`
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength
}
