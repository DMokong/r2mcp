import { getPool } from '../db.js';
import { fingerprint } from '../fingerprint.js';
import { currentScope } from '../env.js';

export interface RejectInput {
  id: string;
  reason: string;
}

export interface RejectResult {
  rejected_id: string;
  reason_id: string;
  message: string;
}

export async function reject(
  input: RejectInput,
  scope: string = currentScope(),
): Promise<RejectResult> {
  const pool = getPool();
  const { id, reason } = input;

  // Mark the original memory's type as 'rejection' (matching schema CHECK
  // constraint). Scope-restricted so a project can't reject another's memory.
  const updateResult = await pool.query(
    `UPDATE memories SET type = 'rejection', updated_at = NOW()
     WHERE id = $1 AND project_scope = $2
     RETURNING id, tier, topics, people`,
    [id, scope],
  );

  if (updateResult.rows.length === 0) {
    throw new Error(`No memory found with id ${id}`);
  }

  const original = updateResult.rows[0];

  // Store the rejection reason as a new memory entry in the same scope.
  const fp = fingerprint(reason);
  const reasonResult = await pool.query(
    `INSERT INTO memories (content, tier, type, section, topics, people, fingerprint, project_scope)
     VALUES ($1, $2, 'rejection', $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      reason,
      original.tier,
      `rejection-of:${id}`,
      original.topics || [],
      original.people || [],
      fp,
      scope,
    ],
  );

  return {
    rejected_id: id,
    reason_id: reasonResult.rows[0].id,
    message: `Memory ${id} marked as rejected. Reason stored as ${reasonResult.rows[0].id}.`,
  };
}
