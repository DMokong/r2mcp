// r2mcp-memory's read side: pure functions over a recall reply, no `$`.
import { parseJsonObject } from './gateFork'
import { clean } from './scribe'
import type { Hit } from '../../types'

/** The hits in a recall reply's text block; empty when it holds none. */
export function parseHits(text: string): Hit[] {
  const body = parseJsonObject(text) as { results?: unknown[] } | undefined
  const results = Array.isArray(body?.results) ? body.results : []

  return results.flatMap(raw => {
    const one = raw as {
      id?: string
      tier?: string
      content?: string
      score?: number
      metadata?: { type?: string; topics?: string[]; updated?: string }
    }
    if (!one.id || !one.content) return []

    return [
      {
        id: one.id,
        tier: one.tier ?? '',
        type: one.metadata?.type ?? '',
        content: clean(one.content),
        topics: Array.isArray(one.metadata?.topics) ? one.metadata.topics.map(String) : [],
        score: typeof one.score === 'number' ? one.score : 0,
        updated: one.metadata?.updated,
      },
    ]
  })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A moment as local clock time, `14:05`; with the day, `Oct 22 14:05`, when it is not today. */
export function stamp(at: number, now: number): string {
  const d = new Date(at)
  const today = new Date(now)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const isToday =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()

  return isToday ? time : `${MONTHS[d.getMonth()]} ${d.getDate()} ${time}`
}

/** A moment's local calendar date, `2026-10-23`: what a memory's `date` should say. */
export function localDate(at: number): string {
  const d = new Date(at)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** How long ago an ISO date was, short: `today`, `12d`, `3mo`, `2y`. */
export function age(updated: string | undefined, now: number): string {
  if (!updated) return ''
  const days = Math.floor((now - Date.parse(updated)) / 86_400_000)
  if (Number.isNaN(days)) return ''
  if (days < 1) return 'today'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`

  return `${Math.floor(days / 365)}y`
}

/** A score as a bar of `cells` cells: the filled part, then the empty part. */
export function bar(score: number, cells = 6): readonly [string, string] {
  const filled = Math.max(0, Math.min(cells, Math.round(score * cells)))

  return ['█'.repeat(filled), '░'.repeat(cells - filled)]
}
