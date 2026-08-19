import { getPool } from '../db.js';
import { fingerprint } from '../fingerprint.js';
import { embedText, embeddingWarning } from '../embeddings.js';
import { currentScope } from '../env.js';
import pgvector from 'pgvector';

const { toSql } = pgvector;

export type Operation = 'ADD' | 'UPDATE' | 'ARCHIVE' | 'REJECTION' | 'NOOP';
export type Tier = 'preferences' | 'project-context' | 'conversations';
export type MemoryType =
  | 'preference'
  | 'decision'
  | 'context'
  | 'relationship'
  | 'observation'
  | 'rejection';

export interface MemoryMetadata {
  type: MemoryType;
  topics?: string[];
  people?: string[];
  section?: string;
  date?: string;
}

export interface RememberInput {
  operation: Operation;
  tier: Tier;
  content: string;
  metadata: MemoryMetadata;
  target_id?: string;
}

export interface RememberResult {
  operation: Operation;
  id?: string;
  dedup?: boolean;
  message: string;
  /** Present only when the operation completed degraded (claw-8cjf.2). */
  warnings?: string[];
}

/**
 * SPEC-059: this used to take a `projectRoot` and fire a graph rebuild inline
 * after each successful write. That side effect now lives in the stdio
 * registration layer (src/register/remember.ts) as an injected `afterWrite`
 * callback, so the remote profile can compose the same tool without any route
 * to node:child_process.
 */
export async function remember(
  input: RememberInput,
  scope: string = currentScope(),
): Promise<RememberResult> {
  const { operation, tier, content, metadata, target_id } = input;

  if (operation === 'NOOP') {
    return { operation: 'NOOP', message: 'No action taken.' };
  }

  const pool = getPool();

  if (operation === 'ADD' || operation === 'REJECTION') {
    const fp = fingerprint(content);
    const type = operation === 'REJECTION' ? 'rejection' : metadata.type;

    // Check for dedup via fingerprint — per scope (claw-nyxd): the same insight
    // can exist independently in two projects.
    const existing = await pool.query(
      'SELECT id FROM memories WHERE fingerprint = $1 AND project_scope = $2',
      [fp, scope],
    );

    if (existing.rows.length > 0) {
      // Dedup: just update timestamp
      await pool.query('UPDATE memories SET updated_at = NOW() WHERE id = $1', [
        existing.rows[0].id,
      ]);
      return {
        operation,
        id: existing.rows[0].id,
        dedup: true,
        message: `Duplicate detected. Updated timestamp for existing memory ${existing.rows[0].id}.`,
      };
    }

    // Generate embedding (null-safe)
    const embedding = await embedText(content);

    const result = await pool.query(
      `INSERT INTO memories (content, tier, type, section, topics, people, date, fingerprint, embedding, project_scope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        content,
        tier,
        type,
        metadata.section || null,
        metadata.topics || [],
        metadata.people || [],
        metadata.date || null,
        fp,
        embedding ? toSql(embedding) : null,
        scope,
      ],
    );

    const warning = embeddingWarning(embedding);
    return {
      operation,
      id: result.rows[0].id,
      dedup: false,
      message: `Memory stored with id ${result.rows[0].id}.`,
      ...(warning ? { warnings: [warning] } : {}),
    };
  }

  if (operation === 'UPDATE') {
    if (!target_id) {
      return { operation: 'UPDATE', message: 'UPDATE requires target_id.' };
    }

    const fp = fingerprint(content);
    const embedding = await embedText(content);

    const result = await pool.query(
      `UPDATE memories SET
        content = $1,
        tier = $2,
        type = $3,
        section = $4,
        topics = $5,
        people = $6,
        date = $7,
        fingerprint = $8,
        embedding = $9,
        updated_at = NOW()
       WHERE id = $10 AND project_scope = $11
       RETURNING id`,
      [
        content,
        tier,
        metadata.type,
        metadata.section || null,
        metadata.topics || [],
        metadata.people || [],
        metadata.date || null,
        fp,
        embedding ? toSql(embedding) : null,
        target_id,
        scope,
      ],
    );

    if (result.rows.length === 0) {
      return { operation: 'UPDATE', message: `No memory found with id ${target_id}.` };
    }

    const warning = embeddingWarning(embedding);
    return {
      operation: 'UPDATE',
      id: result.rows[0].id,
      message: `Memory ${target_id} updated.`,
      ...(warning ? { warnings: [warning] } : {}),
    };
  }

  if (operation === 'ARCHIVE') {
    if (!target_id) {
      return { operation: 'ARCHIVE', message: 'ARCHIVE requires target_id.' };
    }

    // Soft-archive: set type to 'archived' (preserves data for reversibility).
    // Scope-restricted so a project can't archive another project's memory.
    const archived = await pool.query(
      "UPDATE memories SET type = 'archived', updated_at = NOW() WHERE id = $1 AND project_scope = $2 RETURNING id",
      [target_id, scope],
    );

    if (archived.rows.length === 0) {
      return { operation: 'ARCHIVE', message: `No memory found with id ${target_id}.` };
    }

    // If replacement content is provided, insert it as a new memory
    let replacementWarning: string | null = null;
    if (content && content.trim().length > 0) {
      const fp = fingerprint(content);
      const embedding = await embedText(content);
      replacementWarning = embeddingWarning(embedding);

      await pool.query(
        `INSERT INTO memories (content, tier, type, section, topics, people, date, fingerprint, embedding, project_scope)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          content,
          tier,
          metadata.type,
          metadata.section || null,
          metadata.topics || [],
          metadata.people || [],
          metadata.date || null,
          fp,
          embedding ? toSql(embedding) : null,
          scope,
        ],
      );
    }

    return {
      operation: 'ARCHIVE',
      id: target_id,
      message: `Memory ${target_id} archived.${content ? ' Replacement stored.' : ''}`,
      ...(replacementWarning ? { warnings: [replacementWarning] } : {}),
    };
  }

  return { operation, message: `Unknown operation: ${operation}` };
}
