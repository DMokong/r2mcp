import pg from 'pg';
const targets = [
  { name: 'cindy_memory:5433', url: 'postgresql://cindy:cindy@localhost:5433/cindy_memory' },
  { name: 'r2mcp-postgres:5432', url: 'postgresql://r2mcp:r2mcp@localhost:5432/r2mcp' },
  { name: 'Supabase', url: process.env.R2MCP_DATABASE_URL },
];
for (const t of targets) {
  const c = new pg.Client({ connectionString: t.url, ssl: t.name === 'Supabase' ? { rejectUnauthorized: false } : undefined });
  try {
    await c.connect();
    const total = await c.query("SELECT count(*)::int AS c FROM memories WHERE type != 'archived'");
    const arch  = await c.query("SELECT count(*)::int AS c FROM memories WHERE type = 'archived'");
    const recent = await c.query("SELECT count(*)::int AS c FROM memories WHERE updated_at > NOW() - INTERVAL '7 days'");
    const last30 = await c.query("SELECT count(*)::int AS c FROM memories WHERE updated_at > NOW() - INTERVAL '30 days'");
    const tier = await c.query("SELECT tier, count(*)::int AS c FROM memories WHERE type != 'archived' GROUP BY tier ORDER BY tier");
    const newest = await c.query("SELECT updated_at::text AS t, content FROM memories ORDER BY updated_at DESC LIMIT 1");
    const oldest = await c.query("SELECT updated_at::text AS t FROM memories ORDER BY updated_at ASC LIMIT 1");
    console.log(`\n=== ${t.name} ===`);
    console.log(`active:        ${total.rows[0].c}`);
    console.log(`archived:      ${arch.rows[0].c}`);
    console.log(`written ≤ 7d:  ${recent.rows[0].c}`);
    console.log(`written ≤ 30d: ${last30.rows[0].c}`);
    console.log(`oldest write:  ${oldest.rows[0]?.t ?? 'n/a'}`);
    console.log(`newest write:  ${newest.rows[0]?.t ?? 'n/a'}`);
    console.log(`tier breakdown:`);
    tier.rows.forEach(r => console.log(`  ${r.tier}: ${r.c}`));
    if (newest.rows[0]) console.log(`newest content (truncated): ${newest.rows[0].content.slice(0, 100)}…`);
  } catch (e) {
    console.log(`\n=== ${t.name} ===`);
    console.log(`ERROR: ${e.message}`);
  } finally {
    await c.end().catch(() => {});
  }
}
