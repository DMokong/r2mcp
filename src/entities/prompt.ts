import { ENTITY_TYPES, EntityType, ExtractionResponse, ExtractionNewEntity, ExtractionMatched } from './types.js';

export type ParseResult =
  | { ok: true;  value: ExtractionResponse; warnings: string[] }
  | { ok: false; error: string };

function isMatched(x: unknown): x is ExtractionMatched {
  return typeof x === 'object' && x !== null
    && typeof (x as any).canonical_name === 'string'
    && typeof (x as any).confidence === 'number';
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

export function parseExtractionResponse(raw: string): ParseResult {
  let json: any;
  try { json = JSON.parse(raw); }
  catch (e) { return { ok: false, error: `invalid JSON: ${(e as Error).message}` }; }

  if (typeof json !== 'object' || json === null) return { ok: false, error: 'response is not an object' };
  if (!Array.isArray(json.matched)) return { ok: false, error: 'missing or non-array `matched`' };
  if (!Array.isArray(json.new_entities)) return { ok: false, error: 'missing or non-array `new_entities`' };

  const warnings: string[] = [];
  const matched: ExtractionMatched[] = [];
  for (const m of json.matched) {
    if (!isMatched(m)) { warnings.push(`dropped malformed matched entry: ${JSON.stringify(m).slice(0, 100)}`); continue; }
    const c = clamp01(m.confidence);
    if (c !== m.confidence) warnings.push(`clamped matched confidence ${m.confidence} → ${c} for ${m.canonical_name}`);
    matched.push({ canonical_name: m.canonical_name, confidence: c });
  }

  const new_entities: ExtractionNewEntity[] = [];
  for (const n of json.new_entities) {
    if (typeof n !== 'object' || n === null) { warnings.push(`dropped non-object new_entity`); continue; }
    if (!ENTITY_TYPES.includes(n.type)) { warnings.push(`dropped new_entity with invalid type: ${n.type}`); continue; }
    if (typeof n.canonical_name !== 'string' || n.canonical_name.length === 0) { warnings.push(`dropped new_entity with empty canonical_name`); continue; }
    if (typeof n.confidence !== 'number') { warnings.push(`dropped new_entity ${n.canonical_name}: confidence not a number`); continue; }
    const aliases = Array.isArray(n.aliases) ? n.aliases.filter((a: unknown) => typeof a === 'string') : [];
    const c = clamp01(n.confidence);
    if (c !== n.confidence) warnings.push(`clamped new_entity confidence ${n.confidence} → ${c} for ${n.canonical_name}`);
    new_entities.push({ type: n.type as EntityType, canonical_name: n.canonical_name, aliases, confidence: c });
  }

  return { ok: true, value: { matched, new_entities }, warnings };
}

export interface PromptInput {
  memory_content: string;
  known_entities: Array<{ type: EntityType; canonical_name: string; aliases: string[] }>;
}

export function buildExtractionPrompt({ memory_content, known_entities }: PromptInput): string {
  const knownBlock = known_entities.length
    ? known_entities.map(e => `- ${e.type}: ${e.canonical_name}${e.aliases.length ? ` (aliases: ${e.aliases.join(', ')})` : ''}`).join('\n')
    : '(none yet)';

  return `You are an entity extractor. Identify entities in the memory below.

KNOWN ENTITIES (use these canonical names exactly when matched):
${knownBlock}

ENTITY TYPES: project, person, tool, decision (no other types allowed)

MEMORY:
"""
${memory_content}
"""

Return a single JSON object — no prose, no markdown — with this exact shape:
{
  "matched": [{"canonical_name": "<must-match-known-entity-exactly>", "confidence": 0.0-1.0}],
  "new_entities": [{"type": "project|person|tool|decision", "canonical_name": "<name>", "aliases": ["alt1"], "confidence": 0.0-1.0}]
}

Rules:
- "matched" canonical_names must EXACTLY match a known entity's canonical_name (case-sensitive).
- "new_entities" type MUST be one of project, person, tool, decision. Other types will be rejected.
- "aliases" is optional; omit or use [] if no aliases observed.
- If the memory references no entities, return {"matched": [], "new_entities": []}.
- Output JSON only. No code fences. No commentary.`;
}
