/**
 * Migration script: imports tiered markdown memory files into PostgreSQL.
 *
 * Usage:
 *   R2MCP_DATABASE_URL=postgresql://localhost:5432/r2mcp npx tsx scripts/migrate.ts <memory-dir>
 *
 * Where <memory-dir> contains preferences.md, project-context.md, conversations.md
 *
 * Idempotent — re-running produces zero new rows thanks to SHA-256 fingerprint dedup.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { initDb, closeDb } from '../db.js';
import { loadEnvFile } from '../env.js';
import { remember } from '../tools/remember.js';
import type { Tier, MemoryType, MemoryMetadata } from '../tools/remember.js';

export interface ParsedEntry {
  content: string;
  tier: Tier;
  metadata: MemoryMetadata;
}

const TIER_FILES: { file: string; tier: Tier; defaultType: MemoryType }[] = [
  { file: 'preferences.md', tier: 'preferences', defaultType: 'preference' },
  { file: 'project-context.md', tier: 'project-context', defaultType: 'context' },
  { file: 'conversations.md', tier: 'conversations', defaultType: 'relationship' },
];

function parseInlineMetadata(text: string): Partial<MemoryMetadata> {
  const meta: Partial<MemoryMetadata> = {};
  const commentRegex = /<!--\s*(.*?)\s*-->/gs;
  let match: RegExpExecArray | null;

  while ((match = commentRegex.exec(text)) !== null) {
    const body = match[1];
    const typeMatch = body.match(/type:(\S+)/);
    if (typeMatch) meta.type = typeMatch[1] as MemoryType;
    const topicsMatch = body.match(/topics:(\S+)/);
    if (topicsMatch) meta.topics = topicsMatch[1].split(',').filter(Boolean);
    const peopleMatch = body.match(/people:(\S+)/);
    if (peopleMatch) meta.people = peopleMatch[1].split(',').filter(Boolean);
  }
  return meta;
}

export function parseMarkdownEntries(
  content: string,
  tier: Tier,
  defaultType: MemoryType,
): ParsedEntry[] {
  const lines = content.split('\n');
  const entries: ParsedEntry[] = [];
  let currentSection: string | undefined;
  let currentEntry: string[] | null = null;

  function flushEntry() {
    if (!currentEntry || currentEntry.length === 0) return;
    const raw = currentEntry.join('\n').trim();
    if (!raw) return;
    const inlineMeta = parseInlineMetadata(raw);
    entries.push({
      content: raw,
      tier,
      metadata: {
        type: inlineMeta.type || defaultType,
        section: currentSection,
        ...(inlineMeta.topics && { topics: inlineMeta.topics }),
        ...(inlineMeta.people && { people: inlineMeta.people }),
      },
    });
  }

  for (const line of lines) {
    if (/^# /.test(line)) continue;
    if (/^## /.test(line)) {
      flushEntry();
      currentEntry = null;
      currentSection = line.replace(/^##\s*/, '').trim();
      continue;
    }
    if (/^- /.test(line)) {
      flushEntry();
      currentEntry = [line.slice(2)];
      continue;
    }
    if (currentEntry !== null && /^\s+/.test(line)) {
      currentEntry.push(line);
      continue;
    }
    if (line.trim() === '') continue;
  }
  flushEntry();
  return entries;
}

async function migrate(memoryDir: string) {
  await initDb();
  let totalAdded = 0,
    totalDedup = 0,
    totalErrors = 0;

  for (const { file, tier, defaultType } of TIER_FILES) {
    const filePath = join(memoryDir, file);
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`  ⚠️  Could not read ${filePath}: ${(err as Error).message}`);
      totalErrors++;
      continue;
    }
    const entries = parseMarkdownEntries(raw, tier, defaultType);
    console.log(`Migrating ${file} → tier: ${tier} (${entries.length} entries)`);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const preview = entry.content.slice(0, 60).replace(/\n/g, ' ');
      try {
        const result = await remember({
          operation: 'ADD',
          tier: entry.tier,
          content: entry.content,
          metadata: entry.metadata,
        });
        if (result.dedup) {
          console.log(`  [${i + 1}/${entries.length}] Dedup: "${preview}..."`);
          totalDedup++;
        } else {
          console.log(`  [${i + 1}/${entries.length}] Added: "${preview}..."`);
          totalAdded++;
        }
      } catch (err) {
        console.error(
          `  [${i + 1}/${entries.length}] Error: "${preview}..." — ${(err as Error).message}`,
        );
        totalErrors++;
      }
    }
  }
  console.log(
    `\nMigration complete: ${totalAdded} added, ${totalDedup} deduplicated, ${totalErrors} errors`,
  );
  await closeDb();
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname || '.', 'migrate.ts');

if (isMain) {
  // Load .env only on the CLI path — tests import this module, and a
  // module-level load would leak the consumer's R2MCP_DATABASE_URL into the
  // test process (the test-isolation guard caught exactly that, claw-8cjf.2).
  loadEnvFile(resolve(process.env.PROJECT_ROOT || process.cwd(), '.env'));
  const memoryDir = process.argv[2] ? resolve(process.argv[2]) : null;
  if (!memoryDir) {
    console.error('Usage: tsx scripts/migrate.ts <memory-dir>');
    console.error(
      '  <memory-dir> must contain preferences.md, project-context.md, conversations.md',
    );
    process.exit(1);
  }
  migrate(memoryDir).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
