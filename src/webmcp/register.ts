import { setWebmcpStatus, specsAreLoaded, subscribeRoom } from '../room/store'
import { ALWAYS_ON_TOOLS, SCOPED_TOOLS } from './tools'
import type { ModelContextLike, WebMcpTool } from './types'

function getModelContext(): ModelContextLike | null {
  if (typeof document !== 'undefined' && typeof document.modelContext?.registerTool === 'function') {
    return document.modelContext
  }
  if (typeof navigator !== 'undefined' && typeof navigator.modelContext?.registerTool === 'function') {
    return navigator.modelContext
  }
  return null
}

export function isWebMcpPresent(): boolean {
  return getModelContext() !== null
}

async function registerList(tools: WebMcpTool[], signal: AbortSignal): Promise<void> {
  const ctx = getModelContext()
  if (!ctx) return
  for (const tool of tools) {
    if (signal.aborted) break
    // Devpost / judges: explicit document.modelContext.registerTool in source.
    if (typeof document.modelContext?.registerTool === 'function') {
      await document.modelContext.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: tool.execute,
        },
        { signal },
      )
    } else {
      await ctx.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: tool.execute,
        },
        { signal },
      )
    }
  }
}

let alwaysController: AbortController | null = null
let scopedController: AbortController | null = null
let lastScoped = false
let unsub: (() => void) | null = null

function publishCount(present: boolean) {
  const scopedOn = Boolean(scopedController && !scopedController.signal.aborted)
  const count = present
    ? ALWAYS_ON_TOOLS.length + (scopedOn ? SCOPED_TOOLS.length : 0)
    : 0
  setWebmcpStatus(present, count)
}

async function syncScoped(): Promise<void> {
  const present = isWebMcpPresent()
  if (!present) {
    scopedController?.abort()
    scopedController = null
    lastScoped = false
    publishCount(false)
    return
  }
  const loaded = specsAreLoaded()
  if (!loaded) {
    if (scopedController) {
      scopedController.abort()
      scopedController = null
    }
    lastScoped = false
    publishCount(true)
    return
  }
  if (lastScoped && scopedController && !scopedController.signal.aborted) {
    publishCount(true)
    return
  }
  scopedController?.abort()
  scopedController = new AbortController()
  lastScoped = true
  await registerList(SCOPED_TOOLS, scopedController.signal)
  publishCount(true)
}

/**
 * Always-on: get_room_state, load_fixture, set_specs, list_room.
 * Scoped (both specs loaded): classify_diff, focus_case, export_migration_notes.
 * AbortSignal unregisters on teardown / reset. No tool settles a waiting card.
 */
export async function registerRoomTools(signal: AbortSignal): Promise<number> {
  alwaysController?.abort()
  scopedController?.abort()
  unsub?.()

  const present = isWebMcpPresent()
  if (!present) {
    setWebmcpStatus(false, 0)
    unsub = subscribeRoom(() => {
      void syncScoped()
    })
    signal.addEventListener('abort', () => unsub?.())
    return 0
  }

  alwaysController = new AbortController()
  signal.addEventListener('abort', () => {
    alwaysController?.abort()
    scopedController?.abort()
    unsub?.()
  })
  await registerList(ALWAYS_ON_TOOLS, alwaysController.signal)
  lastScoped = false
  await syncScoped()
  unsub = subscribeRoom(() => {
    void syncScoped()
  })
  return ALWAYS_ON_TOOLS.length + (specsAreLoaded() ? SCOPED_TOOLS.length : 0)
}
