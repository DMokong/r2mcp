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
