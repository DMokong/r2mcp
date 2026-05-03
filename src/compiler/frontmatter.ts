/**
 * YAML frontmatter generation + body comparison helpers for compile output
 * (SPEC-044 B.R3, B.R5).
 *
 * Kept dependency-free: a compact YAML emitter is enough for our schema.
 * We only emit strings, numbers, nulls, and arrays of strings — no nested
 * objects — so a hand-rolled emitter sidesteps the js-yaml dependency.
 */

import type { CompileFrontmatter } from './types.js';

const FRONTMATTER_DELIM = '---';

export function emitFrontmatter(data: CompileFrontmatter): string {
  const lines = [FRONTMATTER_DELIM];
  lines.push(`generated_at: ${quote(data.generated_at)}`);
  lines.push(`compile_run_id: ${quote(data.compile_run_id)}`);
  lines.push(`source_count: ${data.source_count}`);
  lines.push(`provider: ${quote(data.provider)}`);
  if (data.source_git_sha === null) {
    lines.push('source_git_sha: null');
  } else {
    lines.push(`source_git_sha: ${quote(data.source_git_sha)}`);
  }
  if (data.tier) lines.push(`tier: ${quote(data.tier)}`);
  if (data.topic) lines.push(`topic: ${quote(data.topic)}`);
  lines.push('source_memory_ids:');
  for (const id of data.source_memory_ids) {
    lines.push(`  - ${quote(id)}`);
  }
  lines.push(FRONTMATTER_DELIM);
  return lines.join('\n') + '\n';
}

/**
 * Parse the leading `---\n...\n---\n` frontmatter block from a markdown file.
 * Returns the parsed fields (only the ones we emit) and the body that follows.
 * Throws if the file does not start with frontmatter.
 */
export function parseFrontmatter(text: string): { frontmatter: Partial<CompileFrontmatter>; body: string } {
  if (!text.startsWith(FRONTMATTER_DELIM + '\n')) {
    throw new Error('File does not start with YAML frontmatter');
  }
  const rest = text.slice(FRONTMATTER_DELIM.length + 1);
  const endIdx = rest.indexOf('\n' + FRONTMATTER_DELIM + '\n');
  if (endIdx === -1) {
    throw new Error('Frontmatter block is not closed');
  }
  const yaml = rest.slice(0, endIdx);
  const body = rest.slice(endIdx + ('\n' + FRONTMATTER_DELIM + '\n').length);

  const fm: Partial<CompileFrontmatter> = {};
  const ids: string[] = [];
  let inIds = false;
  for (const rawLine of yaml.split('\n')) {
    if (rawLine === '') continue;
    if (rawLine.startsWith('  - ')) {
      if (inIds) ids.push(unquote(rawLine.slice(4)));
      continue;
    }
    inIds = false;
    const colonIdx = rawLine.indexOf(':');
    if (colonIdx === -1) continue;
    const key = rawLine.slice(0, colonIdx).trim();
    const value = rawLine.slice(colonIdx + 1).trim();
    if (key === 'source_memory_ids') {
      inIds = true;
      continue;
    }
    if (key === 'source_count') {
      fm.source_count = Number(value);
    } else if (key === 'source_git_sha') {
      fm.source_git_sha = value === 'null' ? null : unquote(value);
    } else if (key === 'generated_at') fm.generated_at = unquote(value);
    else if (key === 'compile_run_id') fm.compile_run_id = unquote(value);
    else if (key === 'provider') fm.provider = unquote(value);
    else if (key === 'tier') fm.tier = unquote(value) as CompileFrontmatter['tier'];
    else if (key === 'topic') fm.topic = unquote(value);
  }
  fm.source_memory_ids = ids;
  return { frontmatter: fm, body };
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}

/**
 * Extract `## H2` and `### H3` headers from a markdown body. Used by B.R5/B.AC3
 * stability check: header set across two runs must be identical.
 */
export function extractHeaders(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^(##|###)\s+(.+?)\s*$/);
    if (m) out.push(`${m[1]} ${m[2].trim()}`);
  }
  return out;
}

/**
 * Strip frontmatter, headers, and inline citation tags (`<m:abc-123>`,
 * `[m:abc-123]`) so the remaining body text can be Levenshtein-compared
 * for prose-level variance (B.R5/B.AC3 third clause).
 */
export function stripForBodyComparison(text: string): string {
  // Remove frontmatter if present
  let body = text;
  if (body.startsWith(FRONTMATTER_DELIM + '\n')) {
    const rest = body.slice(FRONTMATTER_DELIM.length + 1);
    const endIdx = rest.indexOf('\n' + FRONTMATTER_DELIM + '\n');
    if (endIdx !== -1) body = rest.slice(endIdx + ('\n' + FRONTMATTER_DELIM + '\n').length);
  }
  // Remove markdown header lines
  body = body.split('\n').filter(l => !l.match(/^#{1,6}\s/)).join('\n');
  // Remove citation tags
  body = body.replace(/<m:[a-zA-Z0-9-]+>/g, '');
  body = body.replace(/\[m:[a-zA-Z0-9-]+\]/g, '');
  // Collapse whitespace
  return body.replace(/\s+/g, ' ').trim();
}

/**
 * Levenshtein distance ratio (1.0 = identical, 0.0 = totally different).
 * Used by B.R5/B.AC3 to bound prose-level variance.
 */
export function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Two-row DP for memory efficiency
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
