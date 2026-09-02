import yaml from 'js-yaml'
import { utf8Bytes } from './normalize'

export const SPEC_BYTE_CAP = 200 * 1024

export type ParsedSpec =
  | { ok: true; doc: Record<string, unknown>; warning?: string }
  | { ok: false; error: string }

export function parseSpec(text: string, label: string): ParsedSpec {
  if (utf8Bytes(text) > SPEC_BYTE_CAP) {
    return { ok: false, error: `${label} spec exceeds the 200KB cap.` }
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, error: `${label} spec is empty.` }
  }
  try {
    let doc: unknown
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      doc = JSON.parse(trimmed)
    } else {
      doc = yaml.load(trimmed)
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return { ok: false, error: `${label} spec did not parse to an object.` }
    }
    const rec = doc as Record<string, unknown>
    const openapi = rec.openapi
    let warning: string | undefined
    if (typeof openapi !== 'string' || !openapi.startsWith('3.')) {
      if (rec.swagger) {
        warning = `${label} looks like Swagger 2.0. This room classifies OpenAPI 3.x; results may be incomplete.`
      } else if (!rec.paths) {
        warning = `${label} is missing an OpenAPI 3.x version field.`
      }
    }
    return { ok: true, doc: rec, warning }
  } catch (err) {
    return { ok: false, error: `${label} spec parse error: ${(err as Error).message}` }
  }
}
