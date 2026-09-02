export type McpTextResult = {
  content: Array<{ type: 'text'; text: string }>
}

export function mcpJson(payload: unknown): McpTextResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

export type WebMcpTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute: (
    args: Record<string, unknown>,
    extras?: { signal?: AbortSignal },
  ) => Promise<McpTextResult>
}

export type ModelContextLike = {
  registerTool: (
    tool: {
      name: string
      description: string
      inputSchema: Record<string, unknown>
      annotations?: WebMcpTool['annotations']
      execute: WebMcpTool['execute']
    },
    options?: { signal?: AbortSignal },
  ) => Promise<void> | void
}

declare global {
  interface Document {
    modelContext?: ModelContextLike
  }
  interface Navigator {
    modelContext?: ModelContextLike
  }
}
