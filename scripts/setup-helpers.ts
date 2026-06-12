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
      `Transaction-pooler URL detected (port 6543).\n` +
      `Schema setup needs a session-capable connection — the transaction pooler does not\n` +
      `support prepared statements or DDL. Use the Session pooler (port 5432) instead:\n` +
      `\n` +
      `  Supabase Dashboard → Connect (top of page) → Session pooler\n` +
      `\n` +
      `It looks like: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres\n` +
      `(A Direct connection also works if your network has IPv6 or the IPv4 add-on.)`
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

  if (code === 'ENETUNREACH' || msg.includes('enetunreach')) {
    return {
      cause: `Network unreachable (IPv6) — could not reach ${redactedUrl}`,
      fix:
        'The Supabase Direct connection resolves to an IPv6 address, and this network appears to be IPv4-only ' +
        '(IPv4 for direct connections is a paid add-on). Use the Session pooler instead: in the Supabase dashboard ' +
        'click "Connect" and copy the Session pooler string (port 5432, host like aws-0-<region>.pooler.supabase.com, ' +
        'username postgres.<project-ref>). It is IPv4-compatible on every tier and supports schema setup.',
    };
  }

  if (
    code === 'ETIMEDOUT' || code === 'ENOTFOUND' ||
    msg.includes('connect etimedout') || msg.includes('getaddrinfo')
  ) {
    return {
      cause: `Could not reach ${redactedUrl}`,
      fix: 'Check that the host in DATABASE_URL is correct. For Supabase: verify your IP is allowed under Project Settings → Networking, and that the project ref in the URL matches your project.',
    };
  }

  return {
    cause: `Setup failed: ${err.message}`,
    fix: 'Check R2MCP_DATABASE_URL in .env and ensure the database is accessible',
  };
}
