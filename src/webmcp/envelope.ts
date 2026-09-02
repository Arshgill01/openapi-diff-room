export type EnvelopeError = {
  code: string
  message: string
  waitingIds?: string[]
  details?: unknown
}

export type RoomStatus = {
  specsLoaded: boolean
  classified: boolean
  webmcpPresent: boolean
  toolCount: number
  injectionIgnored: boolean
  counts: {
    waiting: number
    settled: number
    safe: number
    acked: number
    total: number
  }
  waitingIds: string[]
}

export type Envelope<T = unknown> = {
  ok: boolean
  data?: T
  error?: EnvelopeError
  roomStatus: RoomStatus
  validNextActions: string[]
  note_to_agent?: string
}

export const ErrorCode = {
  INVALID_ARGS: 'INVALID_ARGS',
  SPECS_REQUIRED: 'SPECS_REQUIRED',
  PARSE_FAILED: 'PARSE_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  REQUIRES_HUMAN: 'REQUIRES_HUMAN',
  BLOCKED_UNSETTLED: 'BLOCKED_UNSETTLED',
  CAP_EXCEEDED: 'CAP_EXCEEDED',
  EMPTY_ROOM: 'EMPTY_ROOM',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
