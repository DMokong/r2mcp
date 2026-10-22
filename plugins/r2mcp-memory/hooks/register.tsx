import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnCompleteInput, UiPressArgument } from 'claude-code'

import { TIMED_OUT, appendStore, runFork, runGate, withinCap } from './lib/gateFork'
import { age, bar, parseHits } from './lib/recall'
import { SUMMARY_SYSTEM, parseSummary, readable } from './lib/readable'
import type { Readable, Span } from './lib/readable'
import {
  GATE_LABELS,
  NEAR_SCORE,
  clip,
  flat,
  forkPrompt,
  gateText,
  isJobPrompt,
  jobHeadings,
  parseCandidates,
  planOp,
  precheck,
  refusal,
} from './lib/scribe'
import type {
  FeedbackRecord,
  Hit,
  LogRecord,
  Mode,
  Planned,
  ReaderView,
  Reading,
  Related,
  SummaryEntry,
} from '../types'

// Read and write halves of r2mcp memory in one pane (gate→fork design, instances A and the
// lens's pane): Related follows each prompt in the background, never holding it; the
// scribe weighs each finished turn. Any memory opens in full in the pane's reader.
const PANE = 'r2mcp-memory'
const SERVER = 'memory'
const LOG_KEY = 'log'
const FEEDBACK_KEY = 'feedback'
const CANDIDATES_KEY = 'candidates'
const EXPORT_PATH = 'local/r2mcp-memory/log.json'
const GATE_CAP_MS = 8_000
const FORK_CAP_MS = 120_000
const RECALL_CAP_MS = 10_000
const RELATED_KEEP = 16
const ITEM_KEYS = 'abcdefgh'
const MODES: readonly Mode[] = ['off', 'shadow', 'propose', 'auto']

const asked = atom({ plugin: 'r2mcp-memory', key: 'asked' } as const, 0)
const turn = atom({ plugin: 'r2mcp-memory', key: 'turn' } as const, 0)
const forks = atom({ plugin: 'r2mcp-memory', key: 'forks' } as const, 0)
const busy = atom({ plugin: 'r2mcp-memory', key: 'busy' } as const, '')
const related = atom({ plugin: 'r2mcp-memory', key: 'related' } as const, [])
const items = atom({ plugin: 'r2mcp-memory', key: 'items' } as const, [])
const recent = atom({ plugin: 'r2mcp-memory', key: 'recent' } as const, [])
const reading = atom({ plugin: 'r2mcp-memory', key: 'reading' } as const, null)
const view = atom({ plugin: 'r2mcp-memory', key: 'view' } as const, 'readable')
const summaries = atom({ plugin: 'r2mcp-memory', key: 'summaries' } as const, [])

// The engine follows `$` only into functions declared at the top of this file (or imported
// from the mod's own files), so what the hooks share lives here. `register` sets these.
let mode: Mode = 'shadow'
let relatedTurns = 3
let forkCap = 6
let gateModel = ''
let summaryModel = 'haiku'
let jobPrompts = 'tasks/prompts'
let isOff = false
let isInteractive = true
let headings: string[] = []
let isJob: boolean | undefined
let isRunning = false

type $ = EngineInterface

/** The `# heading` of each scheduled job's prompt file, so a job typed in as a prompt is known. */
async function loadHeadings($: $): Promise<string[]> {
  if (jobPrompts === '') return []
  try {
    const entries = await $.fs.list(jobPrompts)
    const files = await Promise.all(
      entries
        .filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'))
        .map(async entry => ({ name: entry.name, text: await $.fs.read(`${jobPrompts}/${entry.name}`) })),
    )

    return jobHeadings(files.map(file => ({ name: file.name, text: String(file.text) })))
  } catch {
    return []
  }
}

// ── Related: the read half ────────────────────────────────────────────────────────────

async function recall($: $, query: string, topK: number, minScore?: number): Promise<Hit[]> {
  const args: Record<string, unknown> = { query, top_k: topK }
  if (minScore !== undefined) args.min_score = minScore
  const verdict = await withinCap($, $.tool.check({ tool: `mcp__${SERVER}__recall`, input: args }), RECALL_CAP_MS)
  if (verdict === TIMED_OUT || verdict.decision !== 'allow') throw new Error('recall not permitted')
  const out = await withinCap($, $.mcp.call(SERVER, 'recall', args), RECALL_CAP_MS)
  if (out === TIMED_OUT || out.isError) throw new Error('recall failed')
  const block = out.content.find(one => one.type === 'text') as { text?: string } | undefined

  return parseHits(block?.text ?? '')
}

async function followPrompt($: $, text: string): Promise<void> {
  const at = (await read($, asked)) + 1
  await update($, asked, () => at)
  const hits = await recall($, clip(flat(text), 500), 8)
  await update($, related, list => {
    const byId = new Map<string, Related>()
    for (const one of [...hits.map(hit => ({ ...hit, turn: at })), ...(list ?? [])]) {
      if (one.turn <= at - relatedTurns || byId.has(one.id)) continue
      byId.set(one.id, one)
    }

    return [...byId.values()].sort((a, b) => b.turn - a.turn || b.score - a.score).slice(0, RELATED_KEEP)
  })
}

// ── Scribe: the write half ────────────────────────────────────────────────────────────

/** The last prompt the person typed, the tool calls since it, and the session's first prompt. */
async function lastExchange($: $): Promise<{ prompt: string; tools: number; first: string }> {
  const list = await $.session.messages()
  if (!Array.isArray(list)) return { prompt: '', tools: 0, first: '' }
  const isPrompt = (m: (typeof list)[number]) =>
    m.role === 'user' && !(m.toolResults && m.toolResults.length > 0) && m.text.trim() !== ''
  const first = list.find(isPrompt)?.text ?? ''
  let at = -1
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i]
    if (m && isPrompt(m)) {
      at = i
      break
    }
  }
  if (at < 0) return { prompt: '', tools: 0, first }
  const tools = list.slice(at + 1).reduce((n, m) => n + (m.role === 'assistant' ? m.toolUses.length : 0), 0)

  return { prompt: list[at]?.text ?? '', tools, first }
}

/** The nearest existing memory, by r2mcp's semantic recall; undefined when none is near. */
async function nearest($: $, content: string): Promise<Planned['match']> {
  const [top] = await recall($, clip(content, 500), 3, NEAR_SCORE)
  if (!top) return undefined

  return { id: top.id, score: top.score, content: top.content }
}

async function writeMemory($: $, item: Planned): Promise<void> {
  if (item.op === 'NOOP') return
  const session = await $.session.id()
  const date = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const args: Record<string, unknown> = {
    operation: item.op,
    tier: item.tier,
    content: item.content,
    // r2mcp's metadata takes no free keys: provenance rides as a topic, as `date:` does.
    metadata: { type: item.type, topics: [...item.topics, `session:${session}`], date },
  }
  if (item.op === 'UPDATE' && item.match) args.target_id = item.match.id
  const out = await $.mcp.call(SERVER, 'remember', args)
  if (out.isError) throw new Error('r2mcp refused the write')
}

async function logTrigger($: $, record: LogRecord): Promise<void> {
  await appendStore($, LOG_KEY, record, 500)
  await update($, recent, list => [...(list ?? []), record].slice(-8))
}

async function feedback($: $, kind: FeedbackRecord['kind'], item: Planned): Promise<void> {
  const entry: FeedbackRecord = { at: await $.clock.now(), session: await $.session.id(), kind, op: item.op }
  await appendStore($, FEEDBACK_KEY, entry, 500)
}

async function setItem($: $, id: string, change: Partial<Planned>): Promise<void> {
  await update($, items, list => (list ?? []).map(one => (one.id === id ? { ...one, ...change } : one)))
}

async function save($: $, id: string): Promise<void> {
  const item = (await read($, items)).find(one => one.id === id)
  if (!item || (item.status !== 'pending' && item.status !== 'error')) return
  await setItem($, id, { status: 'saving' })
  try {
    await writeMemory($, item)
    await setItem($, id, { status: 'saved', note: undefined })
    await feedback($, 'save', item)
  } catch (error) {
    await setItem($, id, { status: 'error', note: error instanceof Error ? error.message : 'write failed' })
  }
}

async function skip($: $, id: string): Promise<void> {
  const item = (await read($, items)).find(one => one.id === id)
  if (!item || item.status !== 'pending') return
  await setItem($, id, { status: 'skipped' })
  await feedback($, 'skip', item)
}

async function judge($: $, id: string, verdict: 'useful' | 'not-useful'): Promise<void> {
  const item = (await read($, items)).find(one => one.id === id)
  if (!item || item.verdict) return
  await setItem($, id, { verdict })
  await feedback($, verdict, item)
}

/** One trigger, end to end: precheck, gate, fork, plan, act, show. Never throws. */
async function runScribe($: $, e: TurnCompleteInput): Promise<void> {
  const at = (await read($, turn)) + 1
  await update($, turn, () => at)
  const session = await $.session.id()
  const base = { at: await $.clock.now(), session, turn: at }

  const exchange = await lastExchange($)
  if (isJob === undefined && exchange.first !== '') isJob = isJobPrompt(exchange.first, headings)
  const skipped = isOff
    ? 'kill-switch'
    : precheck({
        mode,
        isInteractive,
        isJob: isJob === true,
        prompt: exchange.prompt,
        tools: exchange.tools,
        forks: await read($, forks),
        forkCap,
      })
  if (skipped !== null) {
    // An `off` mod keeps no log at all.
    if (skipped !== 'off') await logTrigger($, { ...base, stage: skipped === 'cap' ? 'cap' : 'skip', skip: skipped })
    return
  }

  await update($, busy, () => 'gate…')
  const gate = await runGate($, gateText(exchange.prompt, e.answer), GATE_LABELS, gateModel, GATE_CAP_MS)
  if (gate.kind !== 'yes') {
    const stage = gate.kind === 'no' ? 'gate-no' : gate.kind === 'unclear' ? 'gate-unclear' : 'gate-error'
    await logTrigger($, { ...base, stage, gate: gate.label, gateMs: gate.ms })
    return
  }

  await update($, forks, n => (n ?? 0) + 1)
  await update($, busy, () => 'fork: extracting…')
  const fork = await runFork($, forkPrompt(e.answer), parseCandidates, FORK_CAP_MS)
  const usage = fork.usage
  const cost = usage
    ? { cacheRead: usage.cache_read_input_tokens, forkInput: usage.input_tokens, forkOutput: usage.output_tokens }
    : {}
  const gateFields = { gate: gate.label, gateMs: gate.ms, forkMs: fork.ms, ...cost }
  if (fork.kind !== 'ok') {
    // Nothing to fork spends no fork: give it back.
    if (fork.kind === 'nothing-to-fork') await update($, forks, n => Math.max(0, (n ?? 1) - 1))
    const stage = fork.kind === 'nothing-to-fork' ? 'nothing-to-fork' : fork.kind === 'invalid' ? 'fork-invalid' : 'fork-error'
    await logTrigger($, { ...base, stage, ...gateFields })
    return
  }

  const dropped: string[] = []
  const planned: Planned[] = []
  for (const [i, candidate] of fork.items.entries()) {
    const why = refusal(candidate)
    if (why) {
      dropped.push(why)
      continue
    }
    await update($, busy, () => 'dedupe: recall…')
    let match: Planned['match']
    let note: string | undefined
    try {
      match = await nearest($, candidate.content)
    } catch (error) {
      note = `dedupe skipped: ${error instanceof Error ? error.message : 'error'}`
    }
    planned.push({
      ...candidate,
      id: `${session.slice(0, 8)}-${at}-${i}`,
      turn: at,
      op: planOp(candidate, match?.score),
      match,
      status: mode === 'shadow' ? 'shadow' : 'pending',
      note,
    })
  }

  let act: LogRecord['act'] = mode === 'shadow' ? 'shadow' : 'proposed'
  if (mode === 'auto') {
    try {
      for (const item of planned) await writeMemory($, item)
      planned.forEach(item => (item.status = 'saved'))
      act = 'written'
    } catch {
      act = 'error'
    }
  }

  await logTrigger($, {
    ...base,
    stage: planned.length > 0 ? 'candidates' : 'no-candidates',
    ...gateFields,
    candidates: planned.length,
    ops: planned.map(item => item.op),
    dropped: dropped.length > 0 ? dropped : undefined,
    act: planned.length > 0 ? act : undefined,
  })
  if (planned.length === 0) return

  // Candidates are kept for the hand review of usefulness; never prompt text.
  for (const item of planned) await appendStore($, CANDIDATES_KEY, { at: base.at, session, ...item }, 200)
  await update($, items, list => [...planned, ...(list ?? [])].slice(0, 12))
  const n = planned.length
  if (mode === 'propose') $.ui.toast(`r2mcp: ${n} memor${n > 1 ? 'ies' : 'y'} to review`)
  if (mode === 'auto') $.ui.toast(`r2mcp: ${act === 'written' ? 'remembered' : 'failed to write'} ${n}`)
}

// ── Reader ────────────────────────────────────────────────────────────────────────────

async function openReader($: $, kind: Reading['kind'], id: string): Promise<void> {
  await update($, reading, () => ({ kind, id }))
  await update($, view, () => 'readable')
  await $.ui.open({ id: PANE, title: 'memory' })
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

async function closeReader($: $): Promise<void> {
  await update($, reading, () => null)
}

/** Names a memory's text: its id and a hash of the text, so an edited memory is new. */
function summaryKey(id: string, text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0

  return `${id}:${hash.toString(36)}`
}

async function setSummary($: $, entry: SummaryEntry): Promise<void> {
  await update($, summaries, list => [...(list ?? []).filter(one => one.key !== entry.key), entry].slice(-30))
}

/** Shows the summary view, asking the model only for a memory not yet summarized. */
async function summarizeMemory($: $, id: string, text: string): Promise<void> {
  await update($, view, () => 'summary')
  const key = summaryKey(id, text)
  const known = (await read($, summaries)).find(one => one.key === key)
  if (known && known.status !== 'error') return
  await setSummary($, { key, status: 'loading' })
  try {
    const reply = await $.model.complete({
      model: summaryModel,
      system: SUMMARY_SYSTEM,
      prompt: `<memory>\n${text}\n</memory>`,
      maxTokens: 400,
      effort: 'low',
      timeoutMs: 20_000,
    })
    const parsed = reply.isAnswered ? parseSummary(reply.text) : null
    if (!parsed) {
      await setSummary($, { key, status: 'error', note: reply.isAnswered ? 'the reply had no summary in it' : reply.reason })
      return
    }
    await setSummary($, { key, status: 'ok', ...parsed })
  } catch (error) {
    await setSummary($, { key, status: 'error', note: error instanceof Error ? error.message : 'failed' })
  }
}

async function setView($: $, next: ReaderView): Promise<void> {
  await update($, view, () => next)
}

async function copyText($: $, text: string, press: UiPressArgument): Promise<void> {
  const out = await $.ui.copy({ text, surface: press.surface })
  $.ui.toast(out.isCopied ? 'copied' : 'copy failed')
}

/**
 * Sets Remember mode as the `/config` row does: the setting is written and the module
 * reloads with it, so the pane's choice lasts across sessions.
 */
async function setMode($: $, next: Mode): Promise<void> {
  if (next === mode) return
  const row = (await $.config.list()).find(one => /^r2mcp-memory(@[^.]*)?\.mode$/.test(one.key))
  if (!row) {
    $.ui.toast('r2mcp: no mode setting found; use /config')
    return
  }
  const out = await $.config.set({ key: row.key, value: next })
  if (out.deny !== undefined) {
    $.ui.toast(`r2mcp: mode not changed: ${out.deny}`)
    return
  }
  mode = next
  await update($, busy, () => '')
  $.ui.toast(`r2mcp: remember mode ${next}`)
}

// ── Stats ─────────────────────────────────────────────────────────────────────────────

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)

  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function summarize(log: readonly LogRecord[], notes: readonly FeedbackRecord[]): string {
  const count = (stage: LogRecord['stage']) => log.filter(r => r.stage === stage).length
  const gated = log.filter(r => r.gateMs !== undefined)
  const yes = gated.filter(r => r.forkMs !== undefined)
  const forked = log.filter(r => r.forkMs !== undefined && r.stage !== 'nothing-to-fork')
  const ops = log.flatMap(r => r.ops ?? [])
  const fb = (kind: FeedbackRecord['kind']) => notes.filter(n => n.kind === kind).length
  const skips = log.filter(r => r.skip).reduce<Record<string, number>>((acc, r) => {
    const key = r.skip ?? 'skip'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const pct = (a: number, b: number) => (b === 0 ? '–' : `${Math.round((a / b) * 100)}%`)

  return [
    `r2mcp-memory · mode ${mode} · ${log.length} triggers logged (rolling 500)`,
    `skipped: ${Object.entries(skips).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    `gate: ${gated.length} asked, yes ${yes.length} (${pct(yes.length, gated.length)}, target ≤15%), unclear ${count('gate-unclear')}, error ${count('gate-error')}, median ${(median(gated.map(r => r.gateMs ?? 0)) / 1000).toFixed(1)}s`,
    `fork: ${forked.length} run, median ${(median(forked.map(r => r.forkMs ?? 0)) / 1000).toFixed(1)}s, median cache read ${median(forked.map(r => r.cacheRead ?? 0)).toLocaleString()} tokens, invalid ${count('fork-invalid')}, error ${count('fork-error')}, nothing-to-fork ${count('nothing-to-fork')}`,
    `candidates: ${ops.length} (ADD ${ops.filter(o => o === 'ADD').length}, UPDATE ${ops.filter(o => o === 'UPDATE').length}, REJECTION ${ops.filter(o => o === 'REJECTION').length}, NOOP ${ops.filter(o => o === 'NOOP').length}); empty forks ${count('no-candidates')}`,
    `judged: useful ${fb('useful')}, not useful ${fb('not-useful')} · saved ${fb('save')}, skipped ${fb('skip')}`,
  ].join('\n')
}

// ── Drawing ───────────────────────────────────────────────────────────────────────────

const ACCENT = '#d2a8ff'
const BLUE = '#79c0ff'
const GREEN = '#7ee787'
const YELLOW = '#e3b341'
const ORANGE = '#ffa657'
const RED = '#ff7b72'
const GREY = '#8b949e'
const OP_COLOR: Record<string, string> = { ADD: GREEN, UPDATE: BLUE, REJECTION: RED, NOOP: GREY }
const MODE_COLOR: Record<string, string> = { shadow: ACCENT, propose: YELLOW, auto: GREEN, off: GREY }
const TIER_COLOR: Record<string, string> = { preferences: ACCENT, 'project-context': BLUE, conversations: ORANGE }
const TIER_SHORT: Record<string, string> = { preferences: 'pref', 'project-context': 'proj', conversations: 'conv' }
const STAGE_MARK: Record<string, [string, string]> = {
  skip: ['·', GREY],
  cap: ['⊘', YELLOW],
  'gate-no': ['·', GREY],
  'gate-unclear': ['?', YELLOW],
  'gate-error': ['✗', RED],
  'nothing-to-fork': ['∅', GREY],
  'fork-error': ['✗', RED],
  'fork-invalid': ['✗', RED],
  'no-candidates': ['○', BLUE],
  candidates: ['●', GREEN],
}
const scoreColor = (score: number) => (score >= 0.6 ? GREEN : score >= 0.45 ? YELLOW : GREY)

type Elements = ReturnType<EngineInterface['ui']['resolve']>

const SPAN_COLOR: Record<string, string> = { code: '#a5d6ff', issue: '#ffa657' }

function drawSpans(el: Elements, list: readonly Span[]) {
  const { Text } = el

  return (
    <Text>
      {list.map((span, i) =>
        span.style === 'bold' ? (
          <Text key={`s${i}`} bold>{span.text}</Text>
        ) : span.style ? (
          <Text key={`s${i}`} color={SPAN_COLOR[span.style]}>{span.text}</Text>
        ) : (
          span.text
        ),
      )}
    </Text>
  )
}

/** A memory laid out by rule: who and when, labelled sections, numbered lists, paragraphs. */
function drawReadable(el: Elements, r: Readable, isDim = false) {
  const { Box, Text } = el

  return (
    <Box flexDirection="column" gap={1}>
      {r.meta && <Text color={GREY}>◷ {r.meta}</Text>}
      {r.blocks.map((block, i) =>
        block.kind === 'label' ? (
          <Text key={`b${i}`} color={ACCENT} bold>
            {block.label}
          </Text>
        ) : block.kind === 'list' ? (
          <Box key={`b${i}`} flexDirection="column">
            {block.items.map((item, n) => (
              <Box key={`b${i}-${n}`}>
                <Box width={4} flexShrink={0}>
                  <Text color={ACCENT}>{` ${n + 1}.`}</Text>
                </Box>
                <Box flexShrink={1}>{isDim ? <Text dimColor>{item.map(s => s.text).join('')}</Text> : drawSpans(el, item)}</Box>
              </Box>
            ))}
          </Box>
        ) : isDim ? (
          <Text key={`b${i}`} dimColor>{block.spans.map(s => s.text).join('')}</Text>
        ) : (
          <Box key={`b${i}`}>{drawSpans(el, block.spans)}</Box>
        ),
      )}
    </Box>
  )
}

export const register: Register = (on, options) => {
  const chosen = String(options.mode ?? 'shadow')
  mode = MODES.find(m => m === chosen) ?? 'shadow'
  relatedTurns = Math.max(1, Math.round(Number(options.relatedTurns ?? 3)))
  forkCap = Math.max(0, Math.round(Number(options.forkCap ?? 6)))
  gateModel = String(options.gateModel ?? '').trim()
  summaryModel = String(options.summaryModel ?? 'haiku').trim() || 'haiku'
  jobPrompts = String(options.jobPrompts ?? 'tasks/prompts').trim().replace(/\/+$/, '')

  on('session.start', async ($, e, next) => {
    // R2MCP_MODS=0 turns it off; DMOKONG_MODS=0 is the marketplace-wide switch it also honours.
    isOff = (await $.env.get('R2MCP_MODS')) === '0' || (await $.env.get('DMOKONG_MODS')) === '0'
    isInteractive = e.isInteractive
    isJob = undefined
    headings = await loadHeadings($)
    await $.command.register({
      name: 'r2mcp-memory',
      description: 'Open the r2mcp memory pane (related memories, what to remember); "clear" empties it',
      argumentHint: '[clear]',
    })
    await $.command.register({
      name: 'r2mcp-memory-stats',
      description: 'Summarize the remember log; "export" also writes it to local/r2mcp-memory/log.json',
      argumentHint: '[export]',
    })
    // Opened even in `off`, so the pane's mode switch can turn it back on.
    if (!isOff && e.isInteractive) void $.ui.open({ id: PANE, title: 'memory' })

    return next(e)
  })

  on('command.run', { command: 'r2mcp-memory' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await update($, related, () => [])
      await update($, items, () => [])
      await update($, recent, () => [])

      return { text: 'r2mcp memory pane cleared.' }
    }
    await $.ui.open({ id: PANE, title: 'memory' })

    return { text: 'r2mcp memory pane opened.' }
  })

  on('command.run', { command: 'r2mcp-memory-stats' }, async ($, e) => {
    const log = await $.store.get(LOG_KEY)
    const notes = await $.store.get(FEEDBACK_KEY)
    const records = (Array.isArray(log) ? log : []) as LogRecord[]
    const feedbacks = (Array.isArray(notes) ? notes : []) as FeedbackRecord[]
    let text = summarize(records, feedbacks)
    if (e.args.trim() === 'export') {
      const candidates = await $.store.get(CANDIDATES_KEY)
      await $.fs.write(
        EXPORT_PATH,
        JSON.stringify({ log: records, feedback: feedbacks, candidates: candidates ?? [] }, null, 2),
      )
      text += `\nexported to ${EXPORT_PATH}`
    }

    return { text }
  })

  // Off the prompt path (gate→fork design, invariant 1): the prompt goes on at once and
  // Related fills in behind it. Nothing is added to the model's context.
  on('prompt.submit', ($, e, next) => {
    if (isOff || !isInteractive || e.command || e.isMeta || flat(e.text).length < 8) return next(e)
    const text = e.text
    $.clock.after(0, () => {
      void followPrompt($, text).catch(() => undefined)
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || mode === 'off' || isRunning) return result

    // After the turn, never during it: the fork shares the warm cache the turn just left.
    isRunning = true
    $.clock.after(0, () => {
      void runScribe($, e)
        .catch(() => undefined)
        .finally(() => {
          isRunning = false
          void update($, busy, () => '')
        })
    })

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // The reader draws in this pane, where the person's focus already is: a pane of its
    // own opens as a tab behind this one, and a press here cannot hand it the keys.
    if (await read($, reading)) {
      const el = $.ui.resolve(e)
      const { Box, Text, Button } = el
      const cols = Math.max(24, e.props.bodyColumns)
      const now = await $.clock.now()
      const what = await read($, reading)
      const layout = await read($, view)
      const memory = what?.kind === 'related' ? (await read($, related)).find(m => m.id === what.id) : undefined
      const item = what?.kind === 'candidate' ? (await read($, items)).find(one => one.id === what.id) : undefined
      const close = () => closeReader($)

      if (!memory && !item) {
        return (
          <Box flexDirection="column" width={cols}>
            <Text dimColor>That memory has left the pane. Go back and pick another.</Text>
            <Button key="back" label="← Back" hotkey="b" onPress={close} />
          </Box>
        )
      }

      const id = memory?.id ?? (item as Planned).id
      const content = memory?.content ?? (item as Planned).content
      const topics = memory?.topics ?? (item as Planned).topics
      const entry = (await read($, summaries)).find(one => one.key === summaryKey(id, content))
      const views: [ReaderView, string, string][] = [
        ['readable', 'Readable', 'r'],
        ['original', 'Original', 'o'],
        ['summary', entry?.status === 'ok' ? 'Summary' : 'Summarize', 'm'],
      ]

      const head = memory ? (
        <Text>
          <Text color="#000000" backgroundColor={TIER_COLOR[memory.tier] ?? GREY}>
            {' '}{memory.tier}{' '}
          </Text>
          <Text color={TIER_COLOR[memory.tier] ?? GREY}> {memory.type}</Text>
          <Text color={scoreColor(memory.score)}> · match {memory.score.toFixed(2)}</Text>
          <Text dimColor>{age(memory.updated, now) ? ` · updated ${age(memory.updated, now)} ago` : ''}</Text>
        </Text>
      ) : (
        <Text>
          <Text color="#000000" backgroundColor={OP_COLOR[(item as Planned).op] ?? GREY}>
            {' '}{(item as Planned).op}{' '}
          </Text>
          <Text color={TIER_COLOR[(item as Planned).tier] ?? GREY}> {(item as Planned).tier}</Text>
          <Text dimColor>/{(item as Planned).type} · turn {(item as Planned).turn}</Text>
        </Text>
      )

      const body =
        layout === 'original' ? (
          <Text>{content}</Text>
        ) : layout === 'summary' ? (
          !entry || entry.status === 'loading' ? (
            <Text color={YELLOW}>⟳ asking {summaryModel} for a plain-English version…</Text>
          ) : entry.status === 'error' ? (
            <Box flexDirection="column">
              <Text color={RED}>✗ no summary: {entry.note}</Text>
              <Button key="retry" label="Try again" onPress={() => summarizeMemory($, id, content)} />
            </Box>
          ) : (
            <Box flexDirection="column" gap={1}>
              <Text bold>{entry.headline}</Text>
              {(entry.points ?? []).map((point, i) => (
                <Box key={`pt-${i}`}>
                  <Box width={3} flexShrink={0}>
                    <Text color={ACCENT}> •</Text>
                  </Box>
                  <Box flexShrink={1}>
                    <Text>{point}</Text>
                  </Box>
                </Box>
              ))}
              {entry.why && (
                <Text>
                  <Text color={ACCENT} bold>Why </Text>
                  {entry.why}
                </Text>
              )}
              <Text dimColor italic>AI summary by {summaryModel}: it may simplify. o shows the memory as stored.</Text>
            </Box>
          )
        ) : (
          drawReadable(el, readable(content))
        )

      const match = item?.match
      const one = item

      return (
        <Box flexDirection="column" width={cols} gap={1}>
          {head}
          <Box gap={1}>
            {views.map(([key, label, hotkey]) =>
              key === layout ? (
                <Button key={`view-${key}`} label={label} hotkey={hotkey} variant="primary" onPress={() => (key === 'summary' ? summarizeMemory($, id, content) : setView($, key))} />
              ) : (
                <Button key={`view-${key}`} label={label} hotkey={hotkey} dimColor onPress={() => (key === 'summary' ? summarizeMemory($, id, content) : setView($, key))} />
              ),
            )}
          </Box>
          {body}
          {one && one.why !== '' && <Text dimColor>proposed because: {one.why}</Text>}
          {topics.length > 0 && <Text color={BLUE}>{topics.map(t => `#${t}`).join(' ')}</Text>}
          {match && (
            <Box flexDirection="column" borderStyle="single" borderColor={GREY} paddingX={1}>
              <Text color={GREY}>
                {one?.op === 'NOOP' ? 'Already known' : one?.op === 'UPDATE' ? 'Would update' : 'Nearest'} · match {match.score.toFixed(2)}
              </Text>
              {layout === 'original' ? <Text dimColor>{match.content}</Text> : drawReadable(el, readable(match.content), true)}
            </Box>
          )}
          {one?.note && <Text color={YELLOW}>{one.note}</Text>}
          <Box gap={1}>
            {one && one.status === 'shadow' && !one.verdict && (
              <Button key="u" label="Useful" hotkey="u" variant="primary" onPress={() => judge($, one.id, 'useful')} />
            )}
            {one && one.status === 'shadow' && !one.verdict && (
              <Button key="n" label="Not useful" hotkey="n" onPress={() => judge($, one.id, 'not-useful')} />
            )}
            {one && (one.status === 'pending' || one.status === 'error') && (
              <Button key="s" label="Save" hotkey="s" variant="primary" onPress={() => save($, one.id)} />
            )}
            {one && one.status === 'pending' && <Button key="k" label="Skip" hotkey="k" onPress={() => skip($, one.id)} />}
            <Button key="copy" label="Copy" hotkey="c" onPress={press => copyText($, content, press)} />
            <Button key="back" label="← Back" hotkey="b" autoFocus onPress={close} />
          </Box>
          {one?.verdict && (
            <Text color={one.verdict === 'useful' ? GREEN : GREY}>{one.verdict === 'useful' ? '✓ judged useful' : '✗ judged not useful'}</Text>
          )}
          {one && (one.status === 'saved' || one.status === 'saving') && (
            <Text color={one.status === 'saved' ? GREEN : YELLOW}>{one.status === 'saved' ? '✓ saved to r2mcp' : '… saving'}</Text>
          )}
          <Text dimColor>{memory ? `id ${memory.id} · ` : ''}b goes back · arrows scroll</Text>
        </Box>
      )
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = Math.max(24, e.props.bodyColumns)
    const rows = Math.max(12, e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 24)
    const now = await $.clock.now()
    const list = (await read($, items)).filter(item => item.status !== 'skipped')
    const memories = await read($, related)
    const log = (await read($, recent)).slice().reverse()
    const used = await read($, forks)
    const working = await read($, busy)
    const gated = log.filter(r => r.gateMs !== undefined)
    const yes = gated.filter(r => r.forkMs !== undefined).length
    const width = cols - 4

    // Cards take five rows, related memories three; the log keeps its three at the foot.
    const cards = list.slice(0, Math.min(ITEM_KEYS.length, Math.max(1, Math.floor((rows - 14) / 2 / 5))))
    const room = Math.max(1, Math.floor((rows - 12 - cards.length * 5 - Math.min(log.length, 3)) / 3))
    const shown = memories.slice(0, Math.min(9, room))

    return (
      <Box flexDirection="column" width={cols}>
        <Box borderStyle="round" borderColor={ACCENT} paddingX={1} justifyContent="space-between">
          <Text>
            <Text color={ACCENT} bold>◆ r2mcp </Text>
            <Text color="#000000" backgroundColor={MODE_COLOR[mode] ?? GREY}>
              {' '}{(isOff ? 'killed' : mode).toUpperCase()}{' '}
            </Text>
          </Text>
          <Text>
            <Text color={GREEN}>{memories.length}</Text>
            <Text dimColor> related · forks </Text>
            <Text color={used >= forkCap ? YELLOW : GREEN}>
              {used}/{forkCap}
            </Text>
            <Text dimColor> · gate </Text>
            <Text color={BLUE}>
              {yes}/{gated.length}
            </Text>
          </Text>
        </Box>

        <Box gap={1}>
          <Text dimColor> remember:</Text>
          {MODES.map(one =>
            one === mode ? (
              <Button key={`mode-${one}`} label={one} variant="primary" onPress={() => setMode($, one)} />
            ) : (
              <Button key={`mode-${one}`} label={one} dimColor onPress={() => setMode($, one)} />
            ),
          )}
        </Box>

        {working !== '' && <Text color={YELLOW}> ⟳ {working}</Text>}

        <Box flexDirection="column" marginTop={1}>
          <Text color={ORANGE} bold>
            {mode === 'shadow' ? '◌ Would remember' : mode === 'auto' ? '✓ Remembered' : '✎ To review'}
          </Text>
          {cards.length === 0 && <Text dimColor>  Nothing yet: most turns produce nothing durable, by design.</Text>}
          {cards.map((item, i) => (
            <Box key={`i-${item.id}`} flexDirection="column" borderStyle="single" borderColor={OP_COLOR[item.op] ?? GREY} paddingX={1}>
              <Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate">
                    <Text color="#000000" backgroundColor={OP_COLOR[item.op] ?? GREY}>
                      {' '}{item.op}{' '}
                    </Text>
                    <Text color={TIER_COLOR[item.tier] ?? GREY}> {TIER_SHORT[item.tier] ?? item.tier}</Text>
                    <Text dimColor>/{item.type}</Text>
                    {item.match && <Text color={GREY}> ≈{item.match.score.toFixed(2)}</Text>}
                    <Text dimColor> · {item.why}</Text>
                  </Text>
                </Box>
                <Button key={`r-${item.id}`} plain hotkey={ITEM_KEYS[i]} dimColor label="read" onPress={() => openReader($, 'candidate', item.id)} />
              </Box>
              <Text>{clip(item.content, width * 2)}</Text>
              {item.note && <Text color={YELLOW} wrap="truncate">{item.note}</Text>}
              {item.status === 'shadow' ? (
                item.verdict ? (
                  <Text color={item.verdict === 'useful' ? GREEN : GREY}>
                    {item.verdict === 'useful' ? '✓ judged useful' : '✗ judged not useful'}
                  </Text>
                ) : (
                  <Box gap={1}>
                    <Button key={`u-${item.id}`} label="Useful" variant="primary" onPress={() => judge($, item.id, 'useful')} />
                    <Button key={`n-${item.id}`} label="Not useful" onPress={() => judge($, item.id, 'not-useful')} />
                  </Box>
                )
              ) : item.status === 'pending' || item.status === 'error' ? (
                <Box gap={1}>
                  <Button key={`s-${item.id}`} label="Save" variant="primary" onPress={() => save($, item.id)} />
                  <Button key={`k-${item.id}`} label="Skip" onPress={() => skip($, item.id)} />
                  {item.status === 'error' && <Text color={RED}>✗ {item.note}</Text>}
                </Box>
              ) : (
                <Text color={item.status === 'saved' ? GREEN : YELLOW}>
                  {item.status === 'saved' ? '✓ saved to r2mcp' : '… saving'}
                </Text>
              )}
            </Box>
          ))}
          {list.length > cards.length && <Text dimColor>  +{list.length - cards.length} more</Text>}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={BLUE} bold>
            ⌕ Related to your last {relatedTurns} prompt{relatedTurns > 1 ? 's' : ''}
          </Text>
          {shown.length === 0 && <Text dimColor>  Nothing yet: memories appear as you talk.</Text>}
          {shown.map((m, i) => {
            const [full, empty] = bar(m.score)
            const when = age(m.updated, now)

            return (
              <Box key={`m-${m.id}`} flexDirection="column">
                <Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="truncate">
                      <Text color={scoreColor(m.score)}>{full}</Text>
                      <Text dimColor>{empty}</Text>
                      <Text color={scoreColor(m.score)}> {m.score.toFixed(2)} </Text>
                      <Text color="#000000" backgroundColor={TIER_COLOR[m.tier] ?? GREY}>
                        {' '}{TIER_SHORT[m.tier] ?? m.tier}{' '}
                      </Text>
                      <Text color={TIER_COLOR[m.tier] ?? GREY}> {m.type}</Text>
                      <Text dimColor>{when ? ` · ${when}` : ''}</Text>
                    </Text>
                  </Box>
                  <Button key={`r-${m.id}`} plain hotkey={String(i + 1)} dimColor label="read" onPress={() => openReader($, 'related', m.id)} />
                </Box>
                <Text dimColor>  {clip(flat(m.content), (cols - 2) * 2)}</Text>
              </Box>
            )
          })}
          {memories.length > shown.length && <Text dimColor>  +{memories.length - shown.length} more</Text>}
        </Box>

        {log.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>── triggers ──</Text>
            {log.slice(0, 3).map(r => {
              const [mark, color] = STAGE_MARK[r.stage] ?? ['·', GREY]
              const detail =
                r.skip ??
                [
                  r.gateMs !== undefined ? `gate ${(r.gateMs / 1000).toFixed(1)}s` : '',
                  r.forkMs !== undefined ? `fork ${(r.forkMs / 1000).toFixed(1)}s` : '',
                  r.cacheRead ? `${Math.round(r.cacheRead / 1000)}k cached` : '',
                  r.ops && r.ops.length > 0 ? r.ops.join('+') : '',
                ]
                  .filter(Boolean)
                  .join(' · ')

              return (
                <Text wrap="truncate">
                  <Text color={color}>{mark} </Text>
                  <Text dimColor>t{r.turn} </Text>
                  <Text color={color}>{r.stage.padEnd(14)}</Text>
                  <Text dimColor>{detail}</Text>
                </Text>
              )
            })}
          </Box>
        )}
        <Text dimColor wrap="truncate">ctrl+x tab, then a key: 1–9 related · a–h to review</Text>
      </Box>
    )
  })

}
