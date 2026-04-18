export function redactDatabaseUrl(url: string): string {
  return url.replace(/:[^:/@]+@/, ':***@');
}

export function validateDatabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.port === '6543') {
    throw new Error(
      `Supabase pooler URL detected (port 6543).\n` +
      `Schema setup requires a direct (non-pooled) connection — use port 5432.\n` +
      `\n` +
      `Find your direct URL in:\n` +
      `  Supabase Dashboard → Project Settings → Database → Connection string → URI\n` +
      `\n` +
      `It looks like: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`
    );
  }
}

export type SetupErrorClassification = {
  cause: string;
  fix: string;
};

export function classifySetupError(err: Error, redactedUrl: string): SetupErrorClassification {
  const msg = err.message.toLowerCase();
  const code = (err as NodeJS.ErrnoException).code;

  if (code === 'ECONNREFUSED' || msg.includes('connect econnrefused') || msg.includes('connection refused')) {
    return {
      cause: `Connection refused — could not reach ${redactedUrl}`,
      fix: 'Check that PostgreSQL is running (Docker: docker compose up -d) and that the host/port in DATABASE_URL are correct',
    };
  }

  if (
    msg.includes('password authentication failed') ||
    msg.includes('authentication failed') ||
    (msg.includes('role') && msg.includes('does not exist'))
  ) {
    return {
      cause: `Authentication failed for ${redactedUrl}`,
      fix: 'Verify R2MCP_DATABASE_URL credentials in .env — username, password, and database name must match your PostgreSQL instance',
    };
  }

  if (
    msg.includes('extension "vector" is not available') ||
    msg.includes('could not open extension control file') ||
    msg.includes('pgvector')
  ) {
    return {
      cause: `pgvector extension not available at ${redactedUrl}`,
      fix: 'Enable pgvector: Supabase Dashboard → Database → Extensions → search "vector" → Enable. For Docker, use pgvector/pgvector:pg17 image.',
    };
  }

  return {
    cause: `Setup failed: ${err.message}`,
    fix: 'Check R2MCP_DATABASE_URL in .env and ensure the database is accessible',
  };
}
