export type Mode = 'off' | 'shadow' | 'propose' | 'auto'

export type Tier = 'preferences' | 'project-context' | 'conversations'

export type MemoryType =
  | 'preference'
  | 'decision'
  | 'context'
  | 'relationship'
  | 'observation'
  | 'rejection'

export type Operation = 'ADD' | 'UPDATE' | 'REJECTION' | 'NOOP'

/** One memory recall returned, as r2mcp holds it. */
export type Hit = {
  id: string
  tier: string
  type: string
  content: string
  topics: string[]
  score: number
  updated?: string
}

/** A recalled memory shown under Related, with the turn whose prompt found it. */
export type Related = Hit & { turn: number }

export type Candidate = {
  content: string
  tier: Tier
  type: MemoryType
  topics: string[]
  why: string
}

export type Planned = Candidate & {
  id: string
  turn: number
  op: Operation
  /** The near-duplicate's id and score, when recall found one. */
  match?: { id: string; score: number; content: string }
  status: 'shadow' | 'pending' | 'saving' | 'saved' | 'skipped' | 'error'
  /** The person's hand judgment in shadow mode. */
  verdict?: 'useful' | 'not-useful'
  note?: string
}

/** What the reader pane shows: a related memory or a candidate, by id. */
export type Reading = { kind: 'related' | 'candidate'; id: string }

/** How the reader lays a memory out: by rule, as stored, or as the model summarized it. */
export type ReaderView = 'readable' | 'original' | 'summary'

/** A model summary of one memory, kept for this session so a reopen costs nothing. */
export type SummaryEntry = {
  /** The memory's id and a hash of its text: an edited memory is summarized again. */
  key: string
  status: 'loading' | 'ok' | 'error'
  headline?: string
  points?: string[]
  why?: string
  note?: string
}

/** Where a trigger stopped. */
export type Stage =
  | 'skip'
  | 'gate-no'
  | 'gate-unclear'
  | 'gate-error'
  | 'cap'
  | 'nothing-to-fork'
  | 'fork-error'
  | 'fork-invalid'
  | 'no-candidates'
  | 'candidates'

/** One trigger. Never holds prompt or answer text. */
export type LogRecord = {
  at: number
  session: string
  turn: number
  stage: Stage
  skip?: string
  gate?: string
  gateMs?: number
  forkMs?: number
  cacheRead?: number
  forkInput?: number
  forkOutput?: number
  candidates?: number
  ops?: Operation[]
  dropped?: string[]
  act?: 'shadow' | 'proposed' | 'written' | 'error'
}

export type FeedbackRecord = {
  at: number
  session: string
  kind: 'save' | 'skip' | 'useful' | 'not-useful'
  op: Operation
}

declare module 'claude-code' {
  interface PluginState {
    'r2mcp-memory': {
      /** Prompts seen, for Related's window. */
      asked: number
      /** Turns completed, for the scribe's candidate ids and log. */
      turn: number
      forks: number
      busy: string
      related: Related[]
      items: Planned[]
      recent: LogRecord[]
      reading: Reading | null
      view: ReaderView
      summaries: SummaryEntry[]
    }
  }
}
