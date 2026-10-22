import { describe, expect, mock, test } from 'claude-code/testing'
import type { ModelForkResult, On, SessionMessage } from 'claude-code'

import {
  isJobPrompt,
  jobHeadings,
  parseCandidates,
  planOp,
  precheck,
  refusal,
} from './lib/scribe'
import { parseSummary, readable } from './lib/readable'
import type { Candidate, LogRecord, Planned } from '../types'

const USAGE = { input_tokens: 40, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 152_000 }
const DECISION =
  'Dustin decided memory-scribe ships in shadow mode first (2026-10-22) because the retired recall mod showed prompt-path work must be measured before it acts.'
const PROMPT = 'adopt the gate-fork design now and build memory-scribe in shadow first, we can look at auto later once the numbers are in'
const OLD = 'An older version of the same decision.'
// Longer than any card shows, so only the reader holds its end.
const LONG =
  'Always present findings, reports, and analyses as visual HTML dashboards rather than plain text or markdown. ' +
  'Dustin strongly prefers rich visual reports. '.repeat(12) +
  'THE-VERY-END-OF-THE-MEMORY.'
const HIT = {
  id: 'aaaaaaaa-1111',
  tier: 'preferences',
  content: LONG,
  score: 0.71,
  metadata: { type: 'preference', topics: ['reports'], updated: '2026-10-01T00:00:00Z' },
}
const SUBMIT = { wait: false, origin: { kind: 'composer' } } as const
const MAIN = {
  plugin: 'r2mcp-memory',
  component: 'Pane',
  requestId: 'r2mcp-memory',
  props: { title: 'memory', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

type World = {
  gate?: string
  fork?: ModelForkResult
  recallScore?: number
  isWriteRefused?: boolean
  messages?: SessionMessage[]
  hits?: unknown[]
  opened: string[]
  writes: Record<string, unknown>[]
  forks: number
  gates: number
  recalls: number
  summaries: number
  store: Record<string, unknown>
}

function world(on: On, given: Partial<World> = {}): World {
  const w: World = { opened: [], writes: [], forks: 0, gates: 0, recalls: 0, summaries: 0, store: {}, ...given }
  on('store.get', (_, e) => ({ value: w.store[e.key] }))
  on('store.set', (_, e) => {
    w.store[e.key] = e.value
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  mock.env(on, {})
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    w.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'sess-1234-abcd' }))
  on('fs.list', () => ({ value: [] }))
  on('session.messages', () => ({
    value: w.messages ?? [
      { role: 'user', text: PROMPT, toolUses: [] },
      { role: 'assistant', text: 'on it', toolUses: [{ tool: 'Bash', input: {}, tool_use_id: 'tu1' }] },
    ],
  }))
  on('model.classify', () => {
    w.gates += 1
    return { value: w.gate ?? 'durable' }
  })
  on('model.fork', () => {
    w.forks += 1
    const reply: ModelForkResult = w.fork ?? {
        isAnswered: true,
        text: JSON.stringify({
          memories: [{ content: DECISION, tier: 'preferences', type: 'decision', topics: ['mods'], why: 'scopes rollout' }],
        }),
        usage: USAGE,
      }
    return { value: reply }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  on('mcp.call', (_, e) => {
    if (e.tool === 'remember') {
      w.writes.push(e.args ?? {})
      return { value: { content: [{ type: 'text', text: '{"id":"new"}' }], isError: w.isWriteRefused === true } }
    }
    // Related asks with no floor; the scribe's dedupe asks with min_score.
    if ((e.args as { min_score?: number } | undefined)?.min_score === undefined) {
      w.recalls += 1
      return { value: { content: [{ type: 'text', text: JSON.stringify({ results: w.hits ?? [] }) }], isError: false } }
    }
    const results =
      w.recallScore === undefined
        ? []
        : [{ id: 'old-memory-id', score: w.recallScore, content: OLD }]
    return { value: { content: [{ type: 'text', text: JSON.stringify({ results }) }], isError: false } }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('model.complete', () => {
    w.summaries += 1
    return {
      value: {
        isAnswered: true,
        text: 'Reports go out as visual dashboards\n- Findings are shown as HTML dashboards\n- Plain text and markdown are avoided\nWhy: Dustin reads visual reports faster',
        usage: USAGE,
      },
    }
  })

  return w
}

const TURN = { answer: 'Built it, in shadow.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

function lastRecord(w: World): LogRecord | undefined {
  const list = (w.store.log ?? []) as LogRecord[]

  return list[list.length - 1]
}

describe('policy', () => {
  test('precheck skips the obvious no’s for free', () => {
    const base = { mode: 'shadow', isInteractive: true, isJob: false, prompt: PROMPT, tools: 1, forks: 0, forkCap: 6 }
    expect(precheck(base)).toBe(null)
    expect(precheck({ ...base, mode: 'off' })).toBe('off')
    expect(precheck({ ...base, isInteractive: false })).toBe('headless')
    expect(precheck({ ...base, isJob: true })).toBe('scheduled-job')
    expect(precheck({ ...base, prompt: 'ok thanks' })).toBe('acknowledgement')
    expect(precheck({ ...base, prompt: 'what time is it', tools: 0 })).toBe('too-small')
    expect(precheck({ ...base, forks: 6 })).toBe('cap')
  })

  test('scheduled-job prompts are recognized by their prompt file heading', () => {
    const headings = jobHeadings([{ name: 'ai-digest.md', text: '\n# AI Content Digest Task\n\nYou are...' }])
    expect(headings).toEqual(['# AI Content Digest Task'])
    expect(isJobPrompt('# AI Content Digest Task\n\nYou are running...', headings)).toBe(true)
    expect(isJobPrompt('please summarize the AI digest', headings)).toBe(false)
  })

  test('the fork reply is held to its schema', () => {
    expect(parseCandidates('no json here')).toBe(null)
    expect(parseCandidates('{"other": []}')).toBe(null)
    expect(parseCandidates('{"memories": []}')).toEqual([])
    const [one] = parseCandidates(`Sure:\n{"memories":[{"content":"${DECISION}","tier":"bogus","type":"decision"}]}`) ?? []
    expect(one?.tier).toBe('project-context')
    expect(one?.type).toBe('decision')
  })

  test('health and secrets never become memories', () => {
    const base: Omit<Candidate, 'content'> = { tier: 'preferences', type: 'context', topics: [], why: '' }
    expect(refusal({ ...base, content: 'Dustin started a new medication on Monday for sleep.' })).toBe('health')
    expect(refusal({ ...base, content: 'The key is sk-or-v1-abcdef1234567890 for OpenRouter.' })).toBe('secret')
    expect(refusal({ ...base, content: DECISION })).toBe(null)
  })

  test('near-duplicates update, exact ones are skipped', () => {
    const c: Candidate = { content: DECISION, tier: 'preferences', type: 'decision', topics: [], why: '' }
    expect(planOp(c, undefined)).toBe('ADD')
    expect(planOp(c, 0.85)).toBe('UPDATE')
    expect(planOp(c, 0.95)).toBe('NOOP')
    expect(planOp({ ...c, type: 'rejection' }, undefined)).toBe('REJECTION')
  })
})

describe('trigger', () => {
  test('a gate no stops before the fork', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000 })
    const w = world(on, { gate: 'nothing' })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(lastRecord(w)?.stage).toBe('gate-no')
    expect(w.forks).toBe(0)
  })

  test('unclear is handled as no', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { gate: 'unclear' })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(lastRecord(w)?.stage).toBe('gate-unclear')
    expect(w.forks).toBe(0)
  })

  test('an acknowledgement costs no model call', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { messages: [{ role: 'user', text: 'ok', toolUses: [] }] })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(lastRecord(w)?.skip).toBe('acknowledgement')
    expect(w.gates).toBe(0)
  })

  test('shadow: a yes forks, plans an ADD, writes nothing, and shows it', { options: { mode: 'shadow' } }, async ($, on) => {
    const clock = mock.clock(on, { now: 5_000 })
    const w = world(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    const record = lastRecord(w)
    expect(record?.stage).toBe('candidates')
    expect(record?.ops).toEqual(['ADD'])
    expect(record?.cacheRead).toBe(152_000)
    expect(record?.act).toBe('shadow')
    expect(w.writes.length).toBe(0)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'r2mcp-memory',
        component: 'Pane',
        requestId: 'r2mcp-memory',
        surface,
        props: { title: 'memory', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
      })
      expect(await ui.find({ type: 'Text', text: /shadow mode first/ })).toBeDefined()
      // A judgment is kept: pressed on the first surface, shown on the next.
      if (surface === 'terminal') await ui.press({ key: `u-sess-123-1-0` })
      expect(await ui.find({ type: 'Text', text: /judged useful/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('nothing to fork gives the fork back', { options: { forkCap: 1 } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { fork: { isAnswered: false, reason: 'nothing-to-fork' } })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(lastRecord(w)?.stage).toBe('nothing-to-fork')
    // The fork was given back: a second turn still forks under a cap of 1.
    w.fork = undefined
    await $.turn.complete({ ...TURN, turnId: 't2' })
    await clock.settle()
    expect(lastRecord(w)?.stage).toBe('candidates')
  })

  test('a reply off the schema is logged as invalid', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { fork: { isAnswered: true, text: 'I think you decided to ship it.', usage: USAGE } })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(lastRecord(w)?.stage).toBe('fork-invalid')
  })

  test('a scheduled job session is never gated', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, {
      messages: [{ role: 'user', text: '# AI Content Digest Task\n\nYou are running as a scheduled task to check...', toolUses: [] }],
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(lastRecord(w)?.skip).toBe('scheduled-job')
    expect(w.gates).toBe(0)
  })
})

describe('modes', () => {
  test('auto writes an UPDATE against the near-duplicate, with the session as a topic', { options: { mode: 'auto' } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { recallScore: 0.86 })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(w.writes.length).toBe(1)
    const write = w.writes[0] as { operation: string; target_id?: string; metadata: { topics: string[] } }
    expect(write.operation).toBe('UPDATE')
    expect(write.target_id).toBe('old-memory-id')
    expect(write.metadata.topics).toContain('session:sess-1234-abcd')
    expect(lastRecord(w)?.act).toBe('written')
  })

  test('a refused write is logged, not thrown', { options: { mode: 'auto' } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { isWriteRefused: true })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()

    expect(w.writes.length).toBe(1)
    expect(lastRecord(w)?.act).toBe('error')
  })

  test('the fork cap holds across turns', { options: { forkCap: 1 } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()
    await $.turn.complete({ ...TURN, turnId: 't2' })
    await clock.settle()

    expect(w.forks).toBe(1)
    expect(lastRecord(w)?.stage).toBe('cap')
  })

  test('propose: Save writes the memory', { options: { mode: 'propose' } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()
    const [item] = (w.store.candidates ?? []) as Planned[]
    expect(item?.status).toBe('pending')

    const ui = await $.ui.mount({
      plugin: 'r2mcp-memory',
      component: 'Pane',
      requestId: 'r2mcp-memory',
      surface: 'terminal',
      props: { title: 'memory', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    await ui.press({ key: `s-${item?.id}` })
    expect(w.writes.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /saved to r2mcp/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('related', () => {
  test('the prompt goes on unheld; Related fills in behind it', async ($, on) => {
    const clock = mock.clock(on, { now: Date.parse('2026-10-23T00:00:00Z') })
    const w = world(on, { hits: [HIT] })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const result = await $.prompt.submit({ text: 'write up the memory audit for me like last time', ...SUBMIT })
    expect(result.context).toBeUndefined()
    expect(w.recalls).toBe(0)

    await clock.settle()
    expect(w.recalls).toBe(1)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...MAIN, surface })
      expect(await ui.find({ type: 'Text', text: /visual HTML dashboards/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /THE-VERY-END/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('a short acknowledgement does not recall', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { hits: [HIT] })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'ok', ...SUBMIT })
    await clock.settle()
    expect(w.recalls).toBe(0)
  })
})

describe('reader', () => {
  test('read opens a related memory in full', async ($, on) => {
    const clock = mock.clock(on, { now: Date.parse('2026-10-23T00:00:00Z') })
    const w = world(on, { hits: [HIT] })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'write up the memory audit for me like last time', ...SUBMIT })
    await clock.settle()

    const main = await $.ui.mount({ ...MAIN, surface: 'terminal' })
    await main.press({ key: `r-${HIT.id}` })
    // The reader is in the same pane, so focus is already on it.
    expect(await main.find({ type: 'Text', text: /THE-VERY-END-OF-THE-MEMORY/ })).toBeDefined()
    await main.unmount()

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...MAIN, surface })
      expect(await ui.find({ type: 'Text', text: /THE-VERY-END-OF-THE-MEMORY/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /#reports/ })).toBeDefined()
      await ui.press({ key: 'back' })
      expect(await ui.find({ type: 'Text', text: /THE-VERY-END/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /Related to your last/ })).toBeDefined()
      await ui.press({ key: `r-${HIT.id}` })
      await ui.unmount()
    }
  })

  test('read opens a candidate with the memory it would update, and judges it', { options: { mode: 'shadow' } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, { recallScore: 0.86 })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()
    const [item] = (w.store.candidates ?? []) as Planned[]
    expect(item?.op).toBe('UPDATE')

    const ui = await $.ui.mount({ ...MAIN, surface: 'terminal' })
    await ui.press({ key: `r-${item?.id}` })
    expect(await ui.find({ type: 'Text', text: /measured before it acts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Would update/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /older version of the same decision/ })).toBeDefined()
    await ui.press({ key: 'u' })
    expect(await ui.find({ type: 'Text', text: /judged useful/ })).toBeDefined()
    await ui.unmount()
    expect(w.writes.length).toBe(0)
  })

  test('propose: Save from the reader writes the memory', { options: { mode: 'propose' } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.turn.complete(TURN)
    await clock.settle()
    const [item] = (w.store.candidates ?? []) as Planned[]

    const ui = await $.ui.mount({ ...MAIN, surface: 'terminal' })
    await ui.press({ key: `r-${item?.id}` })
    await ui.press({ key: 's' })
    expect(w.writes.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /saved to r2mcp/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('mode switch', () => {
  test('a press on the pane sets Remember mode through the config row', { options: { mode: 'shadow' } }, async ($, on) => {
    const clock = mock.clock(on)
    world(on)
    const sets: { key: string; value: unknown }[] = []
    on('config.list', () => ({
      value: [{ key: 'theme' }, { key: 'r2mcp-memory@inline.mode' }] as never,
    }))
    on('config.set', (_, e) => {
      sets.push({ key: e.key, value: e.value })
      return { value: e.value }
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await clock.settle()

    const ui = await $.ui.mount({ ...MAIN, surface: 'terminal' })
    await ui.press({ key: 'mode-propose' })
    expect(sets).toEqual([{ key: 'r2mcp-memory@inline.mode', value: 'propose' }])
    // The mode in force is pressed again: nothing is written.
    await ui.press({ key: 'mode-propose' })
    expect(sets.length).toBe(1)
    await ui.unmount()
  })
})

describe('readable view', () => {
  const OWNER =
    'Owner decisions (Dustin, 2026-09-26) on fable-conductor: 1) next release = "Hardening + Stage 2", epic trk-17b. 2) herdr-jutsu A2A goes ahead separately. 3) Opus 5.5 conducts.'
  const LABELLED =
    'Hooks should DELEGATE to the skill via the Skill tool. **Why:** the PreCompact hook had drifted into a stale duplicate of SKILL.md. **How to apply:** any hook that wants skill behaviour calls the skill.'

  test('who and when become a header, a numbered run a list', () => {
    const r = readable(OWNER)
    expect(r.meta).toBe('Dustin · 2026-09-26')
    expect(r.issues).toEqual(['trk-17b'])
    const list = r.blocks.find(b => b.kind === 'list')
    expect(list?.kind === 'list' ? list.items.length : 0).toBe(3)
    const intro = r.blocks[0]
    expect(intro?.kind === 'para' ? intro.spans.map(s => s.text).join('') : '').toBe('Owner decisions on fable-conductor:')
  })

  test('Why and How to apply become labelled sections, started as sentences', () => {
    const r = readable(LABELLED)
    expect(r.blocks.filter(b => b.kind === 'label').map(b => (b.kind === 'label' ? b.label : ''))).toEqual(['Why', 'How to apply'])
    const why = r.blocks[r.blocks.findIndex(b => b.kind === 'label') + 1]
    expect(why?.kind === 'para' ? why.spans.map(s => s.text).join('') : '').toMatch(/^The PreCompact/)
  })

  test('a lone number is not a list, and nothing is lost', () => {
    const text = 'The cap is 6 forks per session. It was 1) once.'
    const r = readable(text)
    expect(r.blocks.some(b => b.kind === 'list')).toBe(false)
    const all = r.blocks.map(b => (b.kind === 'para' ? b.spans.map(s => s.text).join('') : '')).join(' ')
    expect(all).toBe(text)
  })

  test('a summary reply is read line by line', () => {
    expect(parseSummary('')).toBe(null)
    const s = parseSummary('**Headline here**\n- one\n- two\nWhy: because')
    expect(s).toEqual({ headline: 'Headline here', points: ['one', 'two'], why: 'because' })
  })
})

describe('reader views', () => {
  test('a memory opens readable; Original shows it as stored; Summarize asks once', async ($, on) => {
    const clock = mock.clock(on, { now: Date.parse('2026-10-23T00:00:00Z') })
    const w = world(on, { hits: [{ ...HIT, content: 'Decided (Dustin, 2026-10-01): 1) dashboards first. 2) markdown never. **Why:** faster to read.' }] })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'write up the memory audit for me like last time', ...SUBMIT })
    await clock.settle()
    const ui = await $.ui.mount({ ...MAIN, surface: 'terminal' })
    await ui.press({ key: `r-${HIT.id}` })
    expect(await ui.find({ type: 'Text', text: /Dustin · 2026-10-01/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Why$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\*\*Why/ })).toBeUndefined()

    await ui.press({ key: 'view-original' })
    expect(await ui.find({ type: 'Text', text: /\*\*Why:\*\* faster to read/ })).toBeDefined()

    await ui.press({ key: 'view-summary' })
    expect(w.summaries).toBe(1)
    expect(await ui.find({ type: 'Text', text: /Reports go out as visual dashboards/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /AI summary by haiku/ })).toBeDefined()

    // Back and forth costs nothing: the summary is kept.
    await ui.press({ key: 'view-readable' })
    await ui.press({ key: 'view-summary' })
    expect(w.summaries).toBe(1)
    await ui.unmount()
  })
})
