export type RuleAction = 'auto-settle' | 'wait'
export type RuleBucket = 'settled' | 'safe' | 'waiting'
export type RuleSeverity = 'info' | 'additive' | 'breaking' | 'ambiguous'

export type Rule = {
  id: string
  title: string
  action: RuleAction
  bucket: RuleBucket
  severity: RuleSeverity
  why: string
}

export type CaseStatus =
  | 'auto-settled'
  | 'safe-additive'
  | 'waiting'
  | 'acked-old'
  | 'acked-new'
  | 'acked-intentional'

export type DiffCase = {
  id: string
  ruleId: string
  method: string
  path: string
  jsonPointer: string
  why: string
  oldSnippet: string
  newSnippet: string
  status: CaseStatus
  decidedBy?: 'classifier' | 'human'
  decidedAt?: string
}

export type LogKind = 'tool' | 'human' | 'system'
export type LogOutcome = 'accepted' | 'refused' | 'human'

export type LogEntry = {
  id: string
  at: string
  kind: LogKind
  title: string
  detail?: string
  tool?: string
  argsSummary?: string
  outcome: LogOutcome
  code?: string
}

export type InjectionState = {
  ignored: boolean
  payload: string
  locations: string[]
}

export type RefusalState = {
  code: string
  message: string
  tool: string
  at: string
}

export const HUMAN_ACKED: CaseStatus[] = ['acked-old', 'acked-new', 'acked-intentional']
export const OPEN_WAITING: CaseStatus = 'waiting'
