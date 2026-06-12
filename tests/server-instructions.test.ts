import { describe, it, expect } from 'vitest';
import { SERVER_INSTRUCTIONS } from '../src/server-instructions.js';

// claw-8cjf.8: the MCP initialize response carries usage instructions so a
// fresh project's agent knows to use memory without any CLAUDE.md setup.
// Claude Code truncates server instructions at 2,048 characters.

describe('SERVER_INSTRUCTIONS (claw-8cjf.8)', () => {
  it('fits inside the 2KB surface Claude Code loads (with margin)', () => {
    expect(SERVER_INSTRUCTIONS.length).toBeGreaterThan(100);
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(1900);
  });

  it('teaches the core session loop: recall at start, remember as you go', () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/recall/);
    expect(SERVER_INSTRUCTIONS).toMatch(/remember/);
    expect(SERVER_INSTRUCTIONS).toMatch(/session/i);
  });

  it('explains the empty-database cold start so the tools do not appear inert', () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/empty|first|no memories/i);
  });
});
