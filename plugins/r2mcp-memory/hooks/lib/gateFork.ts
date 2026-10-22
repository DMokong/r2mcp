// The gate → fork base (docs/superpowers/specs/2026-10-22-gate-fork-mods-design.md).
// Copied into each mod rather than shared: nothing says plugins may import across each other.
// Every function that takes `$` is declared at the top level, where the engine follows it.
import type { EngineInterface, ModelUsage } from 'claude-code'

export const TIMED_OUT = Symbol('timed out')

export type GateVerdict =
  | { kind: 'yes' | 'no' | 'unclear'; ms: number; label: string }
  | { kind: 'error'; ms: number; label: string }

export type ForkOutcome<T> =
  | { kind: 'ok'; ms: number; items: T[]; usage: ModelUsage }
  | { kind: 'nothing-to-fork' | 'error' | 'invalid'; ms: number; reason: string; usage?: ModelUsage }

/**
 * The call's result, or TIMED_OUT once `capMs` passes. The cap is a timer of the mod's own;
 * a late answer is dropped and a late failure swallowed.
 */
export async function withinCap<T>(
  $: EngineInterface,
  call: Promise<T>,
  capMs: number,
): Promise<T | typeof TIMED_OUT> {
  call.catch(() => {})
  let timer: { cancel: () => void } | undefined
  const ceiling = new Promise<typeof TIMED_OUT>(resolve => {
    timer = $.clock.after(capMs, () => resolve(TIMED_OUT))
  })
  try {
    return await Promise.race([call, ceiling])
  } finally {
    timer?.cancel()
  }
}

/** Appends to a rolling list in `$.store`. Best effort; never throws. */
export async function appendStore($: EngineInterface, key: string, entry: unknown, keep: number) {
  try {
    const list = await $.store.get(key)
    const next = [...(Array.isArray(list) ? list : []), entry].slice(-keep)
    await $.store.set(key, next)
  } catch {
    // Measurement is best effort.
  }
}

/**
 * Asks the gate. `labels[0]` is the yes label, and `unclear` is always handled as no. With
 * `model` empty it is `$.model.classify` on the engine's small fast model; otherwise
 * `classify` on that model. A failure or a timeout is `error`, never a throw.
 */
export async function runGate(
  $: EngineInterface,
  text: string,
  labels: readonly [string, string, 'unclear'],
  model: string,
  capMs: number,
): Promise<GateVerdict> {
  const started = await $.clock.now()
  try {
    const call = model ? $.model.classify(text, labels, { model }) : $.model.classify(text, labels)
    const label = await withinCap($, call, capMs)
    const ms = (await $.clock.now()) - started
    if (label === TIMED_OUT) return { kind: 'error', ms, label: 'timeout' }
    if (label === labels[0]) return { kind: 'yes', ms, label }
    if (label === labels[1]) return { kind: 'no', ms, label }

    return { kind: 'unclear', ms, label: label ?? 'none' }
  } catch (error) {
    const ms = (await $.clock.now()) - started

    return { kind: 'error', ms, label: error instanceof Error ? error.name : 'error' }
  }
}

/**
 * Forks the session over its own transcript and parses the reply. `parse` answers null for
 * a reply that does not match the schema. The fork has no tools: the mod acts, never the fork.
 */
export async function runFork<T>(
  $: EngineInterface,
  prompt: string,
  parse: (text: string) => T[] | null,
  capMs: number,
): Promise<ForkOutcome<T>> {
  const started = await $.clock.now()
  try {
    const reply = await withinCap($, $.model.fork({ prompt }), capMs)
    const ms = (await $.clock.now()) - started
    if (reply === TIMED_OUT) return { kind: 'error', ms, reason: 'timeout' }
    if (!reply.isAnswered) {
      if (reply.reason === 'nothing-to-fork') return { kind: 'nothing-to-fork', ms, reason: reply.reason }

      return { kind: 'error', ms, reason: reply.reason, usage: reply.usage }
    }
    const items = parse(reply.text)
    if (items === null) return { kind: 'invalid', ms, reason: 'schema', usage: reply.usage }

    return { kind: 'ok', ms, items, usage: reply.usage }
  } catch (error) {
    const ms = (await $.clock.now()) - started

    return { kind: 'error', ms, reason: error instanceof Error ? error.name : 'error' }
  }
}

/** The first `{ ... }` span of a reply, parsed; undefined when there is none. */
export function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}
