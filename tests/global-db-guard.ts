// claw-i6td.2 — structural test-DB isolation.
//
// Wired as a vitest `setupFiles` entry, so it runs before EVERY test module.
// It scrubs R2MCP_DATABASE_URL to a safe local test database, making it
// impossible for any test — even one that reads the env var directly or forgets
// to call setupTestDb() — to reach the production database. This is the
// structural backstop for the 2026-05-09 incident (claw-0vsn).
import { enforceTestDbUrl } from './test-db-guard.js';

enforceTestDbUrl();
